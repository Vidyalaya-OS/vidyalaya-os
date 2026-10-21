from django.contrib import admin
from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from apps.academics import views as academics
from apps.accounts import views as accounts
from apps.people import imports, views as people
from apps.tenancy import views as tenancy

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

auth = [
    path("login", accounts.LoginView.as_view(), name="login"),
    path("refresh", TokenRefreshView.as_view(), name="token-refresh"),
    path("logout", accounts.LogoutView.as_view(), name="logout"),
    path("me", accounts.MeView.as_view(), name="me"),
    path("password", accounts.ChangePasswordView.as_view(), name="change-password"),
    path("invites/<str:token>", accounts.InviteView.as_view(), name="invite"),
    path("otp/request", accounts.OtpRequestView.as_view(), name="otp-request"),
    path("otp/verify", accounts.OtpVerifyView.as_view(), name="otp-verify"),
]

api = [
    path("auth/", include(auth)),
    path("setup-status", people.SetupStatusView.as_view(), name="setup-status"),
    path("my-children", people.MyChildrenView.as_view(), name="my-children"),
    path("imports/students", imports.StudentImportView.as_view(), name="import-students"),
    path("imports/teachers", imports.TeacherImportView.as_view(), name="import-teachers"),
    path("", include(router.urls)),
]

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include(api)),
]
