from dataclasses import dataclass, field
import os
from pathlib import Path
from urllib.parse import urlsplit


def read_dotenv(path: Path = Path('.env')) -> dict[str, str]:
    """Read literal KEY=value entries; never execute a shell or expand variables."""
    values = {}
    if path.is_file():
        for line in path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            key, sep, value = line.partition('=')
            if not sep or not key.strip().replace('_', '').isalnum():
                raise ValueError('Invalid .env entry')
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                value = value[1:-1]
            values[key.strip()] = value
    return values


@dataclass(frozen=True)
class Config:
    port: int = 8765
    token: str = field(default='', repr=False)
    ollama_url: str = 'http://127.0.0.1:11434'
    model: str = 'gemma3:4b'
    connect_timeout: float = 2
    total_timeout: float = 45
    cleanup_timeout: float = 3
    num_ctx: int = 2048
    num_predict: int = 55
    temperature: float = .5
    repeat_penalty: float = 1.15
    max_in_flight: int = 1
    seed: int | None = None

    def __post_init__(self):
        if self.seed is not None and not 0 <= self.seed <= 2147483647:
            raise ValueError('OLLAMA_SEED must be 0..2147483647')
        u = urlsplit(self.ollama_url)
        if (u.scheme != 'http' or u.hostname not in ('127.0.0.1', 'localhost', '::1')
                or u.username or u.password or u.path not in ('', '/') or u.query or u.fragment):
            raise ValueError('OLLAMA_BASE_URL must be a loopback HTTP origin')
        if not 1024 <= self.port <= 65535 or not self.model or len(self.model) > 100:
            raise ValueError('Invalid port or model configuration')
        if not (0 < self.connect_timeout <= 10 and 0 < self.total_timeout <= 120
                and 0 < self.cleanup_timeout <= 10 and 512 <= self.num_ctx <= 4096
                and 16 <= self.num_predict <= 128 and 0 <= self.temperature <= 1
                and 1 <= self.repeat_penalty <= 2 and self.max_in_flight in (1, 2)):
            raise ValueError('Inference configuration is outside supported bounds')
        if self.token and (len(self.token) < 24 or not self.token.isascii() or any(c.isspace() for c in self.token)):
            raise ValueError('COMPANION_TOKEN must be at least 24 ASCII characters without whitespace')

    @classmethod
    def load(cls):
        env = {**read_dotenv(), **os.environ}
        names = {'port': ('COMPANION_PORT', int), 'token': ('COMPANION_TOKEN', str),
                 'ollama_url': ('OLLAMA_BASE_URL', str), 'model': ('OLLAMA_MODEL', str),
                 'connect_timeout': ('OLLAMA_CONNECT_TIMEOUT', float),
                 'total_timeout': ('OLLAMA_TOTAL_TIMEOUT', float),
                 'cleanup_timeout': ('OLLAMA_CLEANUP_TIMEOUT', float),
                 'num_ctx': ('OLLAMA_NUM_CTX', int), 'num_predict': ('OLLAMA_NUM_PREDICT', int),
                 'temperature': ('OLLAMA_TEMPERATURE', float), 'repeat_penalty': ('OLLAMA_REPEAT_PENALTY', float),
                 'seed': ('OLLAMA_SEED', int),
                 'max_in_flight': ('COMPANION_MAX_IN_FLIGHT', int)}
        try:
            return cls(**{k: convert(env[name]) for k, (name, convert) in names.items() if name in env})
        except (ValueError, OverflowError) as e:
            raise ValueError('Invalid companion environment configuration; check .env.example') from None
