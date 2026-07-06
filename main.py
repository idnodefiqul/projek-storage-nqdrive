import anthropic

client = anthropic.Anthropic(
    api_key="sk-mg-v1-91ff50cc57b846aa4fff70ec1e4584c95183f40dd762d8cc23d9f348adbced01",
    base_url="https://zenmux.ai/api/anthropic"
)

message = client.messages.create(
    model="anthropic/claude-fable-5-free",
    max_tokens=1024,
    messages=[
        {
            "role": "user",
            "content": "Halo"
        }
    ]
)

print(message.content)