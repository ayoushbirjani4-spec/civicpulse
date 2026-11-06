import uuid
from datetime import datetime
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, EmailStr, Field, StringConstraints

Email = Annotated[EmailStr, AfterValidator(str.lower)]
DisplayName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=40)]
Password = Annotated[str, Field(min_length=8, max_length=128)]


class RegisterIn(BaseModel):
    email: Email
    password: Password
    display_name: DisplayName


class RegisterOut(BaseModel):
    user_id: uuid.UUID


class VerifyEmailIn(BaseModel):
    email: Email
    code: str = Field(pattern=r"^\d{6}$")


class ResendCodeIn(BaseModel):
    email: Email


class LoginIn(BaseModel):
    email: Email
    password: str = Field(max_length=128)


class RefreshIn(BaseModel):
    refresh_token: str = Field(max_length=2048)


class LogoutIn(RefreshIn):
    pass


class TokenPairOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class ForgotPasswordIn(BaseModel):
    email: Email


class ResetPasswordIn(BaseModel):
    email: Email
    code: str = Field(pattern=r"^\d{6}$")
    new_password: Password


class ChangePasswordIn(BaseModel):
    current_password: str = Field(max_length=128)
    new_password: Password


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    display_name: str
    role: str
    email_verified: bool
    created_at: datetime


class LoginOut(TokenPairOut):
    user: UserOut


class ProfilePatch(BaseModel):
    display_name: DisplayName


class DeviceIn(BaseModel):
    device_id: str = Field(min_length=8, max_length=128)
    push_token: str | None = Field(default=None, max_length=255)


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    slug: str
    name: str
    department: str


class ReportOut(BaseModel):
    id: uuid.UUID
    client_uuid: uuid.UUID
    pin_id: uuid.UUID | None
    category_id: uuid.UUID
    category_name: str
    description: str | None
    lat: float
    lng: float
    accuracy_m: float
    is_mocked: bool
    captured_at: datetime
    created_at: datetime
    state: str
    photo_url: str | None
    # The hazard this report joined: open, pending_repair or closed.
    pin_status: str | None = None


class ImpactOut(BaseModel):
    reports: int
    hazards: int
    # Other people who reported a hazard this user reported too.
    confirmations: int
    in_repair: int
    fixed: int


class ReportPage(BaseModel):
    items: list[ReportOut]
    limit: int
    offset: int
