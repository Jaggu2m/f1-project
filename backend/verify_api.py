import asyncio
import httpx

async def main():
    async with httpx.AsyncClient(base_url="http://127.0.0.1:8000") as client:
        try:
            print("Checking root...")
            resp = await client.get("/")
            print(f"Root: {resp.status_code} {resp.json()}")

            print("Checking race endpoint...")
            resp = await client.get("/race/2023/10")
            print(f"Race: {resp.status_code} {resp.json()}")
            
            # If race is created, check drivers
            print("Checking drivers endpoint...")
            resp = await client.get("/race/2023/10/drivers")
            print(f"Drivers: {resp.status_code} (Length: {len(resp.json())} if 200)")

        except Exception as e:
            print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(main())
