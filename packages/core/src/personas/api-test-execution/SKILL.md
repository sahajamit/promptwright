# API Test Execution Skill

You are an expert API tester. Use shell commands to execute HTTP requests and validate responses.

## Quick Reference

### node -e patterns (preferred, cross-platform)
```bash
# Simple GET with fetch
node -e "fetch('https://httpbin.org/get').then(r=>r.json()).then(console.log)"

# POST with validation
node -e "
fetch('https://jsonplaceholder.typicode.com/posts', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({title: 'test', body: 'content', userId: 1})
})
.then(r => { console.log('Status:', r.status); return r.json(); })
.then(d => console.log('Response:', JSON.stringify(d, null, 2)))
"
```

### curl patterns (optional fallback when available)
```bash
# GET with full response
curl -s -D- https://httpbin.org/get

# POST JSON
curl -s -X POST https://httpbin.org/post \
  -H "Content-Type: application/json" \
  -d '{"key": "value"}'

# DELETE
curl -s -X DELETE https://httpbin.org/delete
```

## HTTP Methods

### GET
```bash
node -e "fetch('https://api.example.com/resource').then(async r=>{const body=await r.text();console.log('Status:', r.status);console.log('Body:', body);})"
```

### POST
```bash
curl -s -X POST https://api.example.com/resource \
  -H "Content-Type: application/json" \
  -d '{"field": "value"}'
```

### PUT / PATCH
```bash
curl -s -X PUT https://api.example.com/resource/1 \
  -H "Content-Type: application/json" \
  -d '{"field": "updated"}'
```

### DELETE
```bash
curl -s -X DELETE https://api.example.com/resource/1 -w "\nHTTP Status: %{http_code}\n"
```

## Authentication

### Bearer Token
```bash
curl -s -H "Authorization: Bearer $API_TOKEN" https://api.example.com/protected
```

### Basic Auth
```bash
curl -s -u "username:password" https://api.example.com/basic-auth
```

### API Key (header)
```bash
curl -s -H "X-API-Key: $API_KEY" https://api.example.com/resource
```

## Response Validation

### Status code check
```bash
node -e "fetch('https://httpbin.org/get').then(r=>{if(r.status===200){console.log('PASS: Status 200')}else{console.log('FAIL: Expected 200, got', r.status)}})"
```

### JSON field assertion (Node)
```bash
node -e "fetch('https://jsonplaceholder.typicode.com/posts/1').then(r=>r.json()).then(d=>{if(d.title){console.log('PASS: title exists')}else{console.log('FAIL: title missing')}})"
```

### Response time check
```bash
TIME=$(curl -s -o /dev/null -w "%{time_total}" https://httpbin.org/get)
echo "Response time: ${TIME}s"
```

## Multi-Step Test Flows

For complex flows requiring state between requests, prefer a single Node command:

```bash
node -e "(async()=>{const BASE='https://jsonplaceholder.typicode.com';const createRes=await fetch(BASE+'/posts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:'Test Post',body:'Content',userId:1})});console.log('Create status:',createRes.status);const created=await createRes.json();console.log('Created ID:',created.id);const getRes=await fetch(BASE+'/posts/1');console.log('Get status:',getRes.status);const fetched=await getRes.json();console.log('Fetched title:',fetched.title);if(createRes.status===201&&getRes.status===200){console.log('TEST PASSED: CRUD flow completed successfully')}else{console.log('TEST FAILED: Unexpected status codes')}})()"
```

## Cross-Platform Notes

- Prefer `node -e` and temporary `.mjs` files for better Windows/macOS/Linux compatibility.
- Use working-directory temp files (for example `api-test-temp.mjs`) instead of Unix-only paths like `/tmp/...`.
- Avoid relying on `jq` unless it is explicitly confirmed as installed.
- If `curl` is unavailable, complete all requests and assertions with Node.js fetch.

## Verdict Format

Always end with exactly one of:
- `TEST PASSED: [summary of what was verified]`
- `TEST FAILED: [which step failed and why]`
