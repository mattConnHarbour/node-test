const url = "https://mcp.zapier.com/api/mcp/s/f006b204-c539-4802-a70e-ac42e7fabfcd/mcp"
const body = JSON.stringify({
  model: "claude-sonnet-4-20250514",
  max_tokens: 1000,
  messages: [{ role: "user", content: "What tools do you have available?" }],
  mcp_servers: [
    {
      type: "url",
      url: "https://mcp.zapier.com/api/mcp/mcp",
      name: "zapier",
      authorization_token:
        "ZjAwNmIyMDQtYzUzOS00ODAyLWE3MGUtYWM0MmU3ZmFiZmNkOjhmZDM2NDU3LWIzMWQtNGRmMC05YzJjLWUyYzcxNDBjZGU1OQ==",
    },
  ],
});

const token = "ZjAwNmIyMDQtYzUzOS00ODAyLWE3MGUtYWM0MmU3ZmFiZmNkOjhmZDM2NDU3LWIzMWQtNGRmMC05YzJjLWUyYzcxNDBjZGU1OQ=="
const response = await fetch(url, {
    method: "POST",
    body,
    headers: {
        authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "x-api-key": token,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "mcp-client-2025-04-04",
    }
});

output = response

// const reader = response.body.getReader();
// const decoder = new TextDecoder();

// let output = ""

// try {
//   while (true) {
//     const { done, value } = await reader.read();
//     if (done) {
//       break;
//     }
//     const text = decoder.decode(value);
//     output += text;
//   }
// } finally {
//   reader.releaseLock();
// }