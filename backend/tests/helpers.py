import httpx


async def register_user(client: httpx.AsyncClient,
                        username: str = 'player',
                        password: str = 'secret123',
                        ):
    response = await client.post(
        '/auth/register',
        json={'username': username, 'password': password},
    )
    assert response.status_code == 200, response.text
    return response.json()

