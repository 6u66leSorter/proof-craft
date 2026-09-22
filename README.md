## VK Mini Apps MVP

- VK app id: `54558405`
- Production URL: `https://barber-class.ru`

### Required env vars

- `VK_APP_ID=54558405`
- `VITE_VK_APP_ID=54558405`
- `VK_ID_OFFSET=10000000000` (optional, default is the same)
- `VK_APP_SECRET=<secure_key_from_vk>` (optional for MVP, required for strict signature validation)

### Notes

- Telegram flow continues to work as before.
- VK users are mapped to internal user ids via `VK_ID_OFFSET + vk_user_id`.
- If `VK_APP_SECRET` is provided, backend verifies VK launch params signature (`sign`) and rejects invalid requests.
