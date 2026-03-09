"""Anthropic provider using native /v1/messages API (supports thinking models)."""
import json
import logging
from anthropic import AsyncAnthropic
from typing import AsyncIterator, List
from .base import BaseProvider

logger = logging.getLogger(__name__)


class AnthropicProvider(BaseProvider):
    def __init__(self, api_key: str, base_url: str):
        # Native Anthropic client — base_url should NOT include /v1
        clean_url = base_url.rstrip("/")
        if clean_url.endswith("/v1"):
            clean_url = clean_url[:-3]
        self.client = AsyncAnthropic(
            api_key=api_key,
            base_url=clean_url,
            timeout=300.0,
        )

    async def stream_chat(
        self,
        messages: List[dict],
        system_prompt: str,
        model: str,
        max_tokens: int,
        temperature: float,
        top_p: float,
        **kwargs
    ) -> AsyncIterator[dict]:
        # Build messages list (system prompt is a separate param in Anthropic API)
        api_messages = []
        for m in messages:
            if m["role"] in ("user", "assistant"):
                api_messages.append({"role": m["role"], "content": m["content"]})

        # Log payload size
        payload_json = json.dumps(api_messages, ensure_ascii=False)
        payload_kb = len(payload_json.encode("utf-8")) / 1024
        logger.info(
            f"[Anthropic] Calling model={model}, max_tokens={max_tokens}, "
            f"messages_count={len(api_messages)}, payload_size={payload_kb:.1f}KB"
        )

        # Build create params
        create_params = {
            "model": model,
            "messages": api_messages,
            "max_tokens": max_tokens,
        }
        if system_prompt:
            create_params["system"] = system_prompt

        # Thinking models: relay doesn't support streaming properly,
        # so use non-stream call and simulate streaming output
        is_thinking = "thinking" in model.lower()
        if is_thinking:
            create_params["temperature"] = 1.0
            create_params["thinking"] = {
                "type": "enabled",
                "budget_tokens": min(max_tokens // 2, 30000),
            }
            # Send a thinking indicator so frontend knows to show "thinking..." status
            yield {"delta": "", "finish_reason": None, "usage": None, "status": "thinking"}
            yield_gen = self._non_stream_call(create_params)
        else:
            create_params["temperature"] = temperature
            create_params["top_p"] = top_p
            yield_gen = self._stream_call(create_params)

        async for chunk in yield_gen:
            yield chunk

    async def _stream_call(self, create_params: dict) -> AsyncIterator[dict]:
        """Streaming call for non-thinking models."""
        usage_data = None
        chunk_count = 0

        try:
            async with self.client.messages.stream(**create_params) as stream:
                async for event in stream:
                    chunk_count += 1
                    if event.type == "content_block_delta":
                        if hasattr(event.delta, "text") and event.delta.text:
                            yield {"delta": event.delta.text, "finish_reason": None, "usage": None}
                    elif event.type == "message_start":
                        if hasattr(event, "message") and hasattr(event.message, "usage"):
                            u = event.message.usage
                            usage_data = {
                                "prompt_tokens": getattr(u, "input_tokens", 0),
                                "completion_tokens": 0,
                            }
                    elif event.type == "message_delta":
                        if hasattr(event, "usage") and event.usage:
                            output_tokens = getattr(event.usage, "output_tokens", 0)
                            if usage_data:
                                usage_data["completion_tokens"] = output_tokens
                            else:
                                usage_data = {"prompt_tokens": 0, "completion_tokens": output_tokens}
        except Exception as e:
            logger.error(f"[Anthropic] Stream call failed: {e}")
            yield {"delta": f"[API Error] {e}", "finish_reason": "stop", "usage": None}
            return

        logger.info(f"[Anthropic] Stream ended. events={chunk_count}, usage={usage_data}")
        yield {"delta": "", "finish_reason": "stop", "usage": usage_data}

    async def _non_stream_call(self, create_params: dict) -> AsyncIterator[dict]:
        """Non-streaming call for thinking models (relay doesn't support streaming for these)."""
        try:
            response = await self.client.messages.create(**create_params)
        except Exception as e:
            logger.error(f"[Anthropic] Non-stream call failed: {e}")
            yield {"delta": f"[API Error] {e}", "finish_reason": "stop", "usage": None}
            return

        # Extract usage
        usage_data = None
        if response.usage:
            usage_data = {
                "prompt_tokens": getattr(response.usage, "input_tokens", 0),
                "completion_tokens": getattr(response.usage, "output_tokens", 0),
            }

        # Extract text content and yield it in chunks to simulate streaming
        full_text = ""
        for block in response.content:
            if hasattr(block, "text"):
                full_text += block.text

        if full_text:
            # Yield in chunks to simulate streaming for the frontend
            chunk_size = 20  # characters per chunk
            for i in range(0, len(full_text), chunk_size):
                chunk_text = full_text[i:i + chunk_size]
                yield {"delta": chunk_text, "finish_reason": None, "usage": None}

        logger.info(f"[Anthropic] Non-stream done. text_len={len(full_text)}, usage={usage_data}")
        yield {"delta": "", "finish_reason": "stop", "usage": usage_data}
