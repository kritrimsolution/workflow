import os
import re
import httpx
import json
import logging
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("backend")

# Load environment variables from parent directory .env file
env_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.env"))
logger.info(f"Loading env from {env_path}")
load_dotenv(dotenv_path=env_path)

app = FastAPI(title="DataFlow Backend Server")

DATABASE_URL = os.getenv("DATABASE_URL")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

class QueryRequest(BaseModel):
    query: str
    params: list = []

class PromptRequest(BaseModel):
    prompt: str
    columns: list[str] = []

# API Routes (Must be declared BEFORE mounting StaticFiles to prevent routing conflicts)

@app.post("/api/db/query")
async def db_query(req: QueryRequest):
    if not DATABASE_URL:
        logger.error("DATABASE_URL is not set in environment.")
        raise HTTPException(status_code=500, detail="Database URL is not configured.")

    match = re.search(r'@([^/:]+)', DATABASE_URL)
    if not match:
        logger.error("Failed to parse database host from DATABASE_URL.")
        raise HTTPException(status_code=500, detail="Invalid DATABASE_URL configuration.")
    
    host = match.group(1)
    url = f"https://{host}/sql"

    try:
        async with httpx.AsyncClient() as client:
            res = await client.post(
                url,
                json={"query": req.query, "params": req.params},
                headers={
                    "Content-Type": "application/json",
                    "Neon-Connection-String": DATABASE_URL
                },
                timeout=30.0
            )
            if res.status_code != 200:
                logger.error(f"Neon API failed with status {res.status_code}: {res.text}")
                return JSONResponse(status_code=res.status_code, content=res.json())
            
            return res.json()
    except Exception as e:
        logger.exception("Exception occurred during database query execution.")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/parse-prompt")
async def parse_prompt(req: PromptRequest):
    if not GEMINI_API_KEY:
        logger.error("GEMINI_API_KEY is not configured.")
        raise HTTPException(status_code=500, detail="Gemini API Key is not configured on the server.")

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"

    system_instruction = (
        "You are an expert compiler translating data transformation natural language prompts into a structured JSON array of nodes.\n"
        f"Available columns in the active dataset: {req.columns}\n\n"
        "Supported Node Subtypes and Config Schemas:\n"
        "1. text_transform: Modify string casing/whitespace.\n"
        "   Config: {\"subtype\": \"text_transform\", \"column\": \"<col>\", \"operation\": \"upper\" | \"lower\" | \"trim\" | \"title\"}\n"
        "2. add_column: Compute a new column via formula. Formulas can reference columns as {ColName}, parse numbers using parseFloat, and support operations like +, -, *, /, ? :, or functions like datediff(DOB_col), operator(Phone_col), upper(col), lower(col), trim(col), len(col).\n"
        "   Config: {\"subtype\": \"add_column\", \"targetColumn\": \"<new_col_name>\", \"formula\": \"<expression>\"}\n"
        "3. rename_column: Rename one or more columns.\n"
        "   Config: {\"subtype\": \"rename_column\", \"renames\": {\"<old_col>\": \"<new_col>\"}}\n"
        "4. delete_column: Remove one or more columns.\n"
        "   Config: {\"subtype\": \"delete_column\", \"columns\": [\"<col1>\", \"<col2>\"]}\n"
        "5. lookup_map: Map key-value pairs in a column.\n"
        "   Config: {\"subtype\": \"lookup_map\", \"sourceColumn\": \"<col>\", \"targetColumn\": \"<new_col>\", \"map\": {\"<key>\": \"<val>\"}}\n"
        "6. replace_value: Replace occurrences of a substring or regex in a column.\n"
        "   Config: {\"subtype\": \"replace_value\", \"column\": \"<col>\", \"find\": \"<string>\", \"replace\": \"<string>\"}\n"
        "7. row_filter: Filter rows matching a rule. Operators: equals, not_equals, contains, starts_with, ends_with, gt, lt, gte, lte, is_empty, not_empty.\n"
        "   Config: {\"subtype\": \"row_filter\", \"column\": \"<col>\", \"operator\": \"<operator>\", \"value\": \"<val>\"}\n"
        "8. rule_engine: Apply data validation rules.\n"
        "   Config: {\"subtype\": \"rule_engine\", \"rules\": [{\"column\": \"<col>\", \"operator\": \"<operator>\", \"value\": \"<val>\", \"action\": \"flag\", \"errorMessage\": \"<msg>\"}]}\n\n"
        "Output ONLY a JSON array. Each element represents a node to insert. It must look like:\n"
        "{\n"
        "  \"type\": \"transform\" | \"filter\",\n"
        "  \"subtype\": \"<subtype>\",\n"
        "  \"label\": \"<short descriptive label for the canvas node>\",\n"
        "  \"config\": { ...config fields... }\n"
        "}\n\n"
        "Rules:\n"
        "- Fuzzy-match user column references against the available columns list where appropriate.\n"
        "- If the user prompt is completely unintelligible or cannot be mapped to any of the above operations, return an empty array: [].\n"
        "- Respond with ONLY the clean JSON array. Do not wrap in markdown ```json blocks or provide any text explanations."
    )

    payload = {
        "contents": [{
            "parts": [{"text": f"User Prompt: {req.prompt}"}]
        }],
        "systemInstruction": {
            "parts": [{"text": system_instruction}]
        },
        "generationConfig": {
            "responseMimeType": "application/json"
        }
    }

    try:
        async with httpx.AsyncClient() as client:
            res = await client.post(url, json=payload, timeout=30.0)
            if res.status_code != 200:
                logger.error(f"Gemini API error ({res.status_code}): {res.text}")
                raise HTTPException(status_code=res.status_code, detail=f"Gemini API returned error: {res.text}")
            
            data = res.json()
            text_response = data["candidates"][0]["content"]["parts"][0]["text"].strip()
            
            parsed = json.loads(text_response)
            if not isinstance(parsed, list):
                # Ensure it's a list
                parsed = [parsed] if isinstance(parsed, dict) else []
                
            return parsed
    except Exception as e:
        logger.exception("Error parsing user prompt with Gemini.")
        raise HTTPException(status_code=500, detail=f"Prompt compilation failed: {str(e)}")

# Mount Frontend static directory (Serves index.html at root "/")
frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../frontend"))
logger.info(f"Mounting static files from {frontend_dir}")
app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
