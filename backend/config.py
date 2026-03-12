import json
import os
from pathlib import Path

CONFIG_PATH = Path(__file__).parent.parent / "config.json"

DEFAULT_CONFIG = {
    "providers": {
        "anthropic": {
            "api_key": "",
            "models": [
                "claude-sonnet-4-5",
                "claude-3-5-sonnet-20241022",
                "claude-3-7-sonnet-20250219"
            ]
        },
        "google": {
            "api_key": "",
            "models": [
                "gemini-2.5-pro-preview-03-25",
                "gemini-2.0-flash",
                "gemini-1.5-pro"
            ]
        },
        "openai": {
            "api_key": "",
            "base_url": "https://api.openai.com/v1",
            "models": ["gpt-4o", "gpt-4o-mini"]
        },
        "doubao": {
            "api_key": "",
            "base_url": "https://ark.cn-beijing.volces.com/api/v3",
            "models": ["ep-20240618051630-xxxxx"]
        }
    },
    "default_provider": "anthropic",
    "default_model": "claude-sonnet-4-5",
    "global_system_prompt": "",
    "default_params": {
        "max_tokens": 100000,
        "temperature": 1.0,
        "top_p": 1.0,
        "frequency_penalty": 0.0
    },
    "context_strategy": "rounds",
    "context_rounds": 10,
    "context_token_threshold": 8000,
    "max_single_message_tokens": 30000,
    "max_total_tokens": 60000
}


def load_config() -> dict:
    if CONFIG_PATH.exists():
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return DEFAULT_CONFIG.copy()


def save_config(config: dict) -> None:
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(config, f, ensure_ascii=False, indent=2)


def get_provider_config(provider: str) -> dict:
    cfg = load_config()
    return cfg.get("providers", {}).get(provider, {})
