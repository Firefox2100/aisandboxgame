from pydantic import BaseModel, Field


class ApiKey(BaseModel):
    """
    An API key that the user supplies when using LLM providers.
    """

    key_id: int = Field(
        ...,
        description='The unique identifier for the API key.',
    )
    user_id: int = Field(
        ...,
        description='The ID of the user who owns this API key.',
    )
