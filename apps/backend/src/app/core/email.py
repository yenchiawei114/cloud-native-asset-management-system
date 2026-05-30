import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.core.celery_app import celery_app
from app.core.config import settings

logger = logging.getLogger(__name__)


def send_email(subject: str, body: str, receiver: str) -> None:
    """非同步排入 Celery 佇列，立即返回。"""
    _send_email_task.delay(subject, body, receiver)


@celery_app.task(
    bind=True,
    max_retries=3,
    name="email.send",
)
def _send_email_task(self, subject: str, body: str, receiver: str) -> None:
    try:
        _send_via_smtp(subject, body, receiver)
        logger.info("email sent to=%s subject=%r", receiver, subject)
    except Exception as exc:
        countdown = 60 * (2 ** self.request.retries)  # 60s → 120s → 240s
        logger.warning(
            "email failed to=%s attempt=%d/%d, retry in %ds: %s",
            receiver,
            self.request.retries + 1,
            self.max_retries + 1,
            countdown,
            exc,
        )
        raise self.retry(exc=exc, countdown=countdown) from exc


def _send_via_smtp(subject: str, body: str, receiver: str) -> None:
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.sender_email
    msg["To"] = receiver
    msg.attach(MIMEText(body, "html"))

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as smtp:
        smtp.ehlo()
        smtp.starttls()
        smtp.login(settings.sender_email, settings.google_smtp_password)
        smtp.sendmail(settings.sender_email, receiver, msg.as_string())
