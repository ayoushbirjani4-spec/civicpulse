import uuid
from datetime import datetime
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, EmailStr, Field, StringConstraints

Email = Annotated[EmailStr, AfterValidator(str.lower)]
DisplayName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=40)]


class RegisterIn(BaseModel):
    email: Email
    password: str = Field(min_length=8, max_length=128)
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
    refresh_token: str


class AccessTokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    display_name: str
    role: str
    email_verified: bool
    created_at: datetime


class LoginOut(AccessTokenOut):
    refresh_token: str
    user: UserOut


class ProfilePatch(BaseModel):
    display_name: DisplayName


class DeviceIn(BaseModel):
    device_id: str = Field(min_length=8, max_length=128)
    push_token: str | None = Field(default=None, max_length=255)
