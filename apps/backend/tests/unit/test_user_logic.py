"""
Unit tests for user business logic (pure functions, no DB/HTTP layer).
"""
from datetime import date, datetime, timezone, timedelta
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.user import (
	validate_password_change,
	_normalize_note_type,
	_role_to_str,
	_sex_to_str,
	_user_to_out,
	_pref_to_out,
)
from app.models.notification_preference import NoteType
from app.models.user import Role, Sex


class TestValidatePasswordChange:
	"""Test password change validation logic."""

	def test_when_passwords_are_different_then_should_pass(self):
		"""Should not raise when new password differs from current."""
		# Should not raise
		validate_password_change("oldpassword", "newpassword")

	def test_when_passwords_are_same_then_should_raise_422(self):
		"""Should raise 422 when new password equals current."""
		with pytest.raises(HTTPException) as exc_info:
			validate_password_change("samepassword", "samepassword")
		
		assert exc_info.value.status_code == 422
		assert "different" in exc_info.value.detail




class TestNormalizeNoteType:
	"""Test notification type normalization."""

	def test_when_receive_email_then_should_return_enum(self):
		"""Should convert string to NoteType enum."""
		result = _normalize_note_type("EMAIL")
		assert result == NoteType.EMAIL

	def test_when_receive_lowercase_then_should_normalize(self):
		"""Should handle lowercase input."""
		result = _normalize_note_type("email")
		assert result == NoteType.EMAIL

	def test_when_receive_mixed_case_then_should_normalize(self):
		"""Should handle mixed case input."""
		result = _normalize_note_type("SlAcK")
		assert result == NoteType.SLACK

	def test_when_receive_with_whitespace_then_should_strip(self):
		"""Should strip whitespace."""
		result = _normalize_note_type("  TEAMS  ")
		assert result == NoteType.TEAMS

	def test_when_receive_invalid_type_then_should_raise_422(self):
		"""Should raise 422 for invalid notification type."""
		with pytest.raises(HTTPException) as exc_info:
			_normalize_note_type("INVALID_TYPE")
		
		assert exc_info.value.status_code == 422
		assert "invalid notification type" in exc_info.value.detail


class TestRoleToStr:
	"""Test Role enum to string conversion."""

	def test_when_receive_role_employee_then_should_return_employee_string(self):
		"""Should convert Role.EMPLOYEE to 'EMPLOYEE'."""
		result = _role_to_str(Role.EMPLOYEE)
		assert result == "EMPLOYEE"

	def test_when_receive_role_admin_then_should_return_admin_string(self):
		"""Should convert Role.ADMIN to 'ADMIN'."""
		result = _role_to_str(Role.ADMIN)
		assert result == "ADMIN"


class TestSexToStr:
	"""Test Sex enum to string conversion."""

	def test_when_receive_sex_male_then_should_return_male_string(self):
		"""Should convert Sex.MALE to 'MALE'."""
		result = _sex_to_str(Sex.MALE)
		assert result == "MALE"

	def test_when_receive_sex_female_then_should_return_female_string(self):
		"""Should convert Sex.FEMALE to 'FEMALE'."""
		result = _sex_to_str(Sex.FEMALE)
		assert result == "FEMALE"


class TestUserToOut:
	"""Test User model to UserOut conversion."""

	def test_when_receive_valid_user_then_should_return_user_out(self):
		"""Should convert User model to UserOut response."""
		# Arrange
		now = datetime.now(timezone.utc)
		user_mock = SimpleNamespace(
			id=1,
			employee_id="123456789",
			name="John Doe",
			sex=Sex.MALE,
			department_id=5,
			location="Headquarters",
			role=Role.EMPLOYEE,
			email="john@example.com",
			must_change_password=False,
			last_password_changed_at=now,
			hire_date=(now - timedelta(days=365)).date(),
			termination_date=None,
			is_active=True,
			created_at=now,
		)

		# Act
		result = _user_to_out(user_mock)

		# Assert
		assert result.id == 1
		assert result.employee_id == "123456789"
		assert result.name == "John Doe"
		assert result.sex == "MALE"
		assert result.department_id == 5
		assert result.location == "Headquarters"
		assert result.role == "EMPLOYEE"
		assert result.email == "john@example.com"
		assert result.must_change_password is False
		assert result.last_password_changed_at == now
		assert result.hire_date == (now - timedelta(days=365)).date()
		assert result.termination_date is None
		assert result.is_active is True
		assert result.created_at == now

	def test_when_receive_admin_user_then_should_return_admin_role_in_output(self):
		"""Should correctly convert ADMIN role."""
		# Arrange
		now = datetime.now(timezone.utc)
		user_mock = SimpleNamespace(
			id=2,
			employee_id="987654321",
			name="Admin User",
			sex=Sex.FEMALE,
			department_id=1,
			location="Headquarters",
			role=Role.ADMIN,
			email="admin@example.com",
			must_change_password=True,
			last_password_changed_at=None,
			hire_date=(now - timedelta(days=730)).date(),
			termination_date=None,
			is_active=True,
			created_at=now,
		)

		# Act
		result = _user_to_out(user_mock)

		# Assert
		assert result.id == 2
		assert result.employee_id == "987654321"
		assert result.name == "Admin User"
		assert result.sex == "FEMALE"
		assert result.department_id == 1
		assert result.location == "Headquarters"
		assert result.role == "ADMIN"
		assert result.email == "admin@example.com"
		assert result.must_change_password is True
		assert result.last_password_changed_at is None
		assert result.hire_date == (now - timedelta(days=730)).date()
		assert result.termination_date is None
		assert result.is_active is True
		assert result.created_at == now


class TestPrefToOut:
	"""Test NotificationPreference model to NotificationPreferenceOut conversion."""

	def test_when_receive_valid_pref_then_should_return_pref_out(self):
		"""Should convert NotificationPreference model to response."""
		# Arrange
		pref_mock = SimpleNamespace(
			id=10,
			user_id=1,
			type=NoteType.EMAIL,
			value="john@example.com",
		)

		# Act
		result = _pref_to_out(pref_mock)

		# Assert
		assert result.id == 10
		assert result.user_id == 1
		assert result.type == "EMAIL"
		assert result.value == "john@example.com"

	def test_when_receive_slack_pref_then_should_return_slack_type(self):
		"""Should correctly convert SLACK notification type."""
		# Arrange
		pref_mock = SimpleNamespace(
			id=11,
			user_id=2,
			type=NoteType.SLACK,
			value="user@slack.com",
		)

		# Act
		result = _pref_to_out(pref_mock)

		# Assert
		assert result.type == "SLACK"
		assert result.value == "user@slack.com"

	def test_when_receive_teams_pref_then_should_return_teams_type(self):
		"""Should correctly convert TEAMS notification type."""
		# Arrange
		pref_mock = SimpleNamespace(
			id=12,
			user_id=3,
			type=NoteType.TEAMS,
			value="user@teams.com",
		)

		# Act
		result = _pref_to_out(pref_mock)

		# Assert
		assert result.type == "TEAMS"
		assert result.value == "user@teams.com"

