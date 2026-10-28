from django.contrib import admin
from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from apps.academics import views as academics
from apps.accounts import views as accounts
from apps.attendance import views as attendance
from apps.core import views as core
from apps.exams import views as exams
from apps.fees import online, views as fees
from apps.homework import views as homework
from apps.dashboards import views as dashboards
from apps.people import imports, views as people
from apps.quizzes import views as quizzes
from apps.tenancy import views as tenancy
from apps.timetable import views as timetable

# Accept paths with or without a trailing slash (the web app's proxy drops it).
router = DefaultRouter()
router.trailing_slash = "/?"
# Platform owner (no school needed)
router.register("platform/schools", tenancy.PlatformSchoolViewSet, basename="platform-school")
# Inside one school (subdomain or X-School header)
router.register("school", tenancy.CurrentSchoolViewSet, basename="school")
router.register("academic-years", academics.AcademicYearViewSet, basename="academic-year")
router.register("classes", academics.SchoolClassViewSet, basename="class")
router.register("subjects", academics.SubjectViewSet, basename="subject")
router.register("sections", academics.SectionViewSet, basename="section")
router.register("section-subjects", academics.SectionSubjectViewSet, basename="section-subject")
router.register("students", people.StudentViewSet, basename="student")
router.register("teachers", people.TeacherViewSet, basename="teacher")
router.register("guardians", people.GuardianViewSet, basename="guardian")
router.register("admins", people.AdminViewSet, basename="admin")
router.register("periods", timetable.PeriodViewSet, basename="period")
router.register("timetable", timetable.TimetableEntryViewSet, basename="timetable")
router.register("homework", homework.HomeworkViewSet, basename="homework")
router.register("grade-scales", exams.GradeScaleViewSet, basename="grade-scale")
router.register("exam-terms", exams.ExamTermViewSet, basename="exam-term")
router.register("exams", exams.ExamViewSet, basename="exam")
router.register("fee-heads", fees.FeeHeadViewSet, basename="fee-head")
router.register("fee-structures", fees.FeeStructureViewSet, basename="fee-structure")
router.register("fee-dues", fees.DueViewSet, basename="fee-due")
router.register("payments", fees.PaymentViewSet, basename="payment")
router.register("quizzes", quizzes.QuizViewSet, basename="quiz")
router.register("quiz-topics", quizzes.TopicViewSet, basename="quiz-topic")
router.register("question-bank", quizzes.QuestionBankViewSet, basename="question-bank")

auth = [
    path("login", accounts.LoginView.as_view(), name="login"),
    path("refresh", TokenRefreshView.as_view(), name="token-refresh"),
    path("logout", accounts.LogoutView.as_view(), name="logout"),
    path("me", accounts.MeView.as_view(), name="me"),
    path("password", accounts.ChangePasswordView.as_view(), name="change-password"),
    path("invites/<str:token>", accounts.InviteView.as_view(), name="invite"),
    path("password-reset", accounts.PasswordResetRequestView.as_view(), name="password-reset-request"),
    path("password-reset/<str:token>", accounts.PasswordResetView.as_view(), name="password-reset"),
    path("otp/request", accounts.OtpRequestView.as_view(), name="otp-request"),
    path("otp/verify", accounts.OtpVerifyView.as_view(), name="otp-verify"),
]

api = [
    path("auth/", include(auth)),
    path("config", core.AppConfigView.as_view(), name="app-config"),
    path("setup-status", people.SetupStatusView.as_view(), name="setup-status"),
    path("my-children", people.MyChildrenView.as_view(), name="my-children"),
    path("dashboard/student", dashboards.StudentDashboardView.as_view(), name="dashboard-student"),
    path("dashboard/parent", dashboards.ParentDashboardView.as_view(), name="dashboard-parent"),
    path("imports/students", imports.StudentImportView.as_view(), name="import-students"),
    path("imports/teachers", imports.TeacherImportView.as_view(), name="import-teachers"),
    path("attendance/sheet", attendance.AttendanceSheetView.as_view(), name="attendance-sheet"),
    path("attendance/pending", attendance.PendingAttendanceView.as_view(), name="attendance-pending"),
    path("attendance/students/<uuid:student_id>", attendance.StudentAttendanceView.as_view(),
         name="attendance-student"),
    path("attendance/reports/daily", attendance.DailyReportView.as_view(), name="attendance-daily"),
    path("attendance/reports/monthly", attendance.MonthlyReportView.as_view(), name="attendance-monthly"),
    path("attendance/reports/low", attendance.LowAttendanceView.as_view(), name="attendance-low"),
    path("attendance/teachers/sheet", attendance.TeacherAttendanceSheetView.as_view(), name="teacher-attendance-sheet"),
    path("attendance/teachers/monthly", attendance.TeacherMonthlyReportView.as_view(),
         name="teacher-attendance-monthly"),
    path("attendance/teachers/me", attendance.MyTeacherAttendanceView.as_view(), name="teacher-attendance-me"),
    path("results/students/<uuid:student_id>", exams.StudentResultsView.as_view(), name="student-results"),
    path("report-cards/section", exams.SectionReportCardsView.as_view(), name="report-cards-section"),
    path("report-cards/remarks", exams.ReportCardRemarksView.as_view(), name="report-cards-remarks"),
    path("report-cards/publish", exams.PublishReportCardsView.as_view(), name="report-cards-publish"),
    path("report-cards/students/<uuid:student_id>/<uuid:term_id>", exams.StudentReportCardView.as_view(),
         name="report-card"),
    path("fees/students/<uuid:student_id>", fees.StudentFeesView.as_view(), name="student-fees"),
    path("fees/balances", fees.BalancesView.as_view(), name="fee-balances"),
    path("fees/defaulters", fees.DefaultersView.as_view(), name="fee-defaulters"),
    path("fees/summary", fees.FeeSummaryView.as_view(), name="fee-summary"),
    path("fees/online/payments", online.OnlinePaymentsView.as_view(), name="online-payments"),
    path("fees/online/payments/<uuid:pk>", online.OnlinePaymentView.as_view(), name="online-payment"),
    path("fees/online/checkout/<str:slug>/<str:token>", online.checkout_page, name="online-checkout"),
    path("fees/online/razorpay/callback/<str:slug>/<str:token>", online.razorpay_callback, name="razorpay-callback"),
    path("fees/online/razorpay/webhook", online.razorpay_webhook, name="razorpay-webhook"),
    path("fees/online/juspay/return/<str:slug>/<str:token>", online.juspay_return, name="juspay-return"),
    path("fees/online/juspay/webhook", online.juspay_webhook, name="juspay-webhook"),
    path("fees/online/simulator/<str:slug>/<str:token>", online.simulator, name="payment-simulator"),
    path("", include(router.urls)),
]

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include(api)),
]
