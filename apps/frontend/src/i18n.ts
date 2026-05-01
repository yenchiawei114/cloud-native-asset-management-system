import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const resources = {
  "zh-TW": {
    translation: {
      auth: {
        loginTab: "帳號登入",
        loginError: "登入失敗，請檢查您的網路連線",
        loginInvalid: "帳號或密碼錯誤",
        title: "歡迎回來",
        subtitle: "請輸入您的員編與密碼以進入資產管理系統",
        idEmail: "員工編號",
        idEmailPlaceholder: "請輸入員工編號 (如: EMP001)",
        password: "登入密碼",
        passwordPlaceholder: "請輸入您的密碼",
        enterControlCenter: "進入控制中心",
        layout: {
          headline: "下一代雲端資產管理平台",
          availabilityLabel: "系統可用性",
          auditLabel: "審計追蹤"
        },
        nav: {
          dashboard: "概覽儀表板",
          myAssets: "我的資產",
          repairHistory: "維修管理",
          profile: "個人設定",
          addNewAsset: "新增設備",
          addNewRequest: "建立維修申請",
          searchMyAssets: "搜尋我的資產...",
          searchAllAssets: "搜尋全公司資產...",
          ticketReview: "工單審核",
          auditLogs: "操作日誌",
          userManagement: "使用者管理"
        }
      },
      profile: {
        title: "個人資料與偏好設定",
        subtitle: "管理您的帳戶資訊、安全性與通知接收方式。",
        basicInfo: "個人基本資料",
        name: "姓名",
        employeeId: "員工編號",
        email: "電子郵件",
        role: "角色權限",
        admin: "系統管理員",
        employee: "一般員工",
        changePassword: "修改登入密碼",
        currentPassword: "目前密碼",
        newPassword: "新密碼",
        confirmPassword: "確認新密碼",
        updatePassword: "更新密碼",
        updating: "更新中...",
        notificationTitle: "通知管道設定",
        notificationDesc: "設定您接收系統通知與維修進度更新的聯繫方式。",
        save: "儲存",
        logout: "登出目前裝置",
        passwordSuccess: "密碼更新成功",
        passwordError: "更新失敗，請檢查輸入內容",
        passwordMatchError: "新密碼與確認密碼不符"
      },
      apiErrors: {
        "Invalid credentials": "帳號或密碼錯誤，請重新輸入",
        "invalid current password": "目前的密碼輸入錯誤，請重新確認",
        "new password must be different": "新密碼不能與舊密碼相同",
        "user not found": "找不到該使用者帳號",
        "invalid notification type": "不支援的通知類型",
        "Forbidden": "權限不足，無法執行此操作",
        "Network Error": "網路連線異常，請稍後再試"
      },
      ticketing: {
        repairHistory: "維修紀錄",
        newRequest: "建立新申請",
        ticketDetails: "工單詳情",
        assetDetails: "資產明細",
        faultDescription: "故障描述",
        spareMachine: "備用機需求",
        pickupLocation: "取件地點",
        repairRecord: "維修紀錄",
        repairDate: "維修日期",
        faultReason: "故障主因",
        solution: "處理方案",
        cost: "維修費用",
        vendor: "維修廠商",
        activityLog: "活動日誌",
        backToList: "返回列表",
        waitingInspection: "等待驗收結果",
        inspectionDesc: "維修完成後，管理員將在此上傳驗收結果與測試報告。",
        needHelp: "需要技術協助？",
        supportDesc: "如果您對此維修單有任何疑問，或需要調整備用機需求，請聯繫 IT 支持中心。",
        onlineSupport: "線上客服",
        timeline: {
          step1: "提交申請",
          step2: "管理員審核",
          step3: "維修中",
          step4: "待驗收",
          step5: "已完成"
        },
        status: {
          OPEN: "已提交",
          IN_PROGRESS: "維修中",
          DONE: "已完成",
          CANCELLED: "已取消"
        },
        inspectionResult: "驗收結果",
        passed: "驗收通過",
        failed: "驗收未通過",
        inspectedAt: "驗收時間",
        noNeed: "無需求",
        notSpecified: "未指定"
      },
      errors: {
        network: "網路連線異常"
      }
    }
  },
  "en-US": {
    translation: {
      auth: {
        loginTab: "Login",
        loginError: "Login failed, please check your network",
        loginInvalid: "Invalid employee ID or password",
        title: "Welcome Back",
        subtitle: "Enter your credentials to access the asset system",
        idEmail: "Employee ID",
        idEmailPlaceholder: "Enter employee ID (e.g., EMP001)",
        password: "Password",
        passwordPlaceholder: "Enter your password",
        enterControlCenter: "Enter Control Center",
        layout: {
          headline: "Next-Gen Cloud Asset Management",
          availabilityLabel: "System Availability",
          auditLabel: "Audit Trail"
        },
        nav: {
          dashboard: "Dashboard",
          myAssets: "My Assets",
          repairHistory: "Repair History",
          profile: "Profile",
          addNewAsset: "Add Asset",
          addNewRequest: "New Request",
          searchMyAssets: "Search my assets...",
          searchAllAssets: "Search all assets...",
          ticketReview: "Tickets",
          auditLogs: "Audit Logs",
          userManagement: "Users"
        }
      },
      profile: {
        title: "Profile & Preferences",
        subtitle: "Manage your account info, security, and notification channels.",
        basicInfo: "Personal Information",
        name: "Name",
        employeeId: "Employee ID",
        email: "Email Address",
        role: "Role",
        admin: "Administrator",
        employee: "Employee",
        changePassword: "Change Password",
        currentPassword: "Current Password",
        newPassword: "New Password",
        confirmPassword: "Confirm Password",
        updatePassword: "Update Password",
        updating: "Updating...",
        notificationTitle: "Notification Channels",
        notificationDesc: "Configure how you receive system alerts and maintenance updates.",
        save: "Save",
        logout: "Logout from Device",
        passwordSuccess: "Password updated successfully",
        passwordError: "Update failed. Please check your inputs.",
        passwordMatchError: "New passwords do not match"
      },
      apiErrors: {
        "Invalid credentials": "Invalid account or password, please try again",
        "invalid current password": "Current password is incorrect. Please try again.",
        "new password must be different": "New password cannot be the same as the old one.",
        "user not found": "User account not found.",
        "invalid notification type": "Unsupported notification type.",
        "Forbidden": "Access denied. Insufficient permissions.",
        "Network Error": "Network connection error. Please try again later."
      },
      ticketing: {
        repairHistory: "Repair History",
        newRequest: "New Request",
        ticketDetails: "Ticket Details",
        assetDetails: "Asset Details",
        faultDescription: "Fault Description",
        spareMachine: "Spare Machine",
        pickupLocation: "Pickup Location",
        repairRecord: "Repair Record",
        repairDate: "Repair Date",
        faultReason: "Fault Reason",
        solution: "Solution",
        cost: "Repair Cost",
        vendor: "Vendor",
        activityLog: "Activity Log",
        backToList: "Back to List",
        waitingInspection: "Waiting for Inspection",
        inspectionDesc: "After repair completion, results and reports will be uploaded here.",
        needHelp: "Need Technical Help?",
        supportDesc: "Contact IT Support if you have questions or need to adjust spare machine specs.",
        onlineSupport: "Online Support",
        timeline: {
          step1: "Request",
          step2: "Review",
          step3: "In Progress",
          step4: "Inspection",
          step5: "Completed"
        },
        status: {
          OPEN: "Submitted",
          IN_PROGRESS: "In Progress",
          DONE: "Completed",
          CANCELLED: "Cancelled"
        },
        inspectionResult: "Inspection Result",
        passed: "Passed",
        failed: "Failed",
        inspectedAt: "Inspected At",
        noNeed: "No Need",
        notSpecified: "Not Specified"
      },
      errors: {
        network: "Network connection error"
      }
    }
  }
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: localStorage.getItem("lng") || "zh-TW",
    fallbackLng: "zh-TW",
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
