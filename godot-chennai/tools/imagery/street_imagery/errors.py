"""Errors the tools raise; each carries enough to print an exact, honest message."""
from __future__ import annotations


class ImageryError(Exception):
    """Base class."""


class MissingTokenError(ImageryError):
    """A provider needs a token and the environment variable is not set."""


class AuthError(ImageryError):
    """The provider answered 401/403 (or an OAuth error): token missing, wrong or expired."""


class NetworkError(ImageryError):
    """No answer from the provider: DNS, proxy refusal, timeout, TLS. Nothing was learned."""


class RateLimitError(ImageryError):
    """Still rate limited after every retry."""


class ProviderError(ImageryError):
    """The provider answered with an error status or a body that is not what its docs describe."""


class TooMuchDataError(ImageryError):
    """The provider says the box is too big or has too many results: split it."""
