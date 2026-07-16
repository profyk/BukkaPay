from app.schemas.base import CamelModel, OptionalJsDateTime


class KycSubmitRequest(CamelModel):
    full_name: str
    document_type: str
    document_number: str


class KycStatusResponse(CamelModel):
    kyc_status: str
    kyc_full_name: str | None = None
    kyc_document_type: str | None = None
    kyc_document_number: str | None = None
    kyc_submitted_at: OptionalJsDateTime = None
    kyc_reviewed_at: OptionalJsDateTime = None
    kyc_rejection_reason: str | None = None
