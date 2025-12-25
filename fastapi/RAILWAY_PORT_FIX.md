# Quick Fix for Railway PORT Error

## Problem
Railway is passing `$PORT` as a literal string instead of the port number.

## Solution

### Option 1: Use railway.json (Recommended)
The `railway.json` file will override the Dockerfile CMD:

```json
{
  "deploy": {
    "startCommand": "uvicorn app.main:app --host 0.0.0.0 --port $PORT"
  }
}
```

**Deploy:**
```bash
git add fastapi/railway.json fastapi/.dockerignore
git commit -m "fix: Railway port configuration"
git push
```

### Option 2: Railway Dashboard
1. Go to Railway → Your FastAPI service → Settings`
2. Under "Deploy", add **Custom Start Command**:
   ```
   uvicorn app.main:app --host 0.0.0.0 --port $PORT
   ```
3. Redeploy

### Option 3: Use Python to Read PORT
Modify Dockerfile CMD:
```dockerfile
CMD python -c "import os; os.system(f'uvicorn app.main:app --host 0.0.0.0 --port {os.getenv(\"PORT\", 8001)}')"
```

## Why This Happens
- Dockerfile's `CMD ["uvicorn", ...]` uses exec form (no shell)
- Exec form doesn't expand environment variables
- Railway sets `PORT` dynamically, so hardcoding won't work

## Recommended: Use railway.json ✅
Already created and ready to deploy!
