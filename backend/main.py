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

def get_db_url():
    load_dotenv(dotenv_path=env_path, override=True)
    return os.getenv("DATABASE_URL")

def get_gemini_key():
    load_dotenv(dotenv_path=env_path, override=True)
    return os.getenv("GEMINI_API_KEY")

class QueryRequest(BaseModel):
    query: str
    params: list = []

class Message(BaseModel):
    role: str
    content: str

class PromptRequest(BaseModel):
    prompt: str
    columns: list[str] = []
    current_nodes: list = []
    current_edges: list = []
    history: list[Message] = []
    chat_mode: bool = False

# API Routes (Must be declared BEFORE mounting StaticFiles to prevent routing conflicts)

@app.post("/api/db/query")
async def db_query(req: QueryRequest):
    db_url = get_db_url()
    if not db_url:
        logger.error("DATABASE_URL is not set in environment.")
        raise HTTPException(status_code=500, detail="Database URL is not configured.")

    match = re.search(r'@([^/:]+)', db_url)
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
                    "Neon-Connection-String": db_url
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
    gemini_key = get_gemini_key()
    if not gemini_key:
        logger.error("GEMINI_API_KEY is not configured.")
        raise HTTPException(status_code=500, detail="Gemini API Key is not configured on the server.")

    if req.chat_mode:
        system_instruction = (
            "You are an expert compiler and conversational assistant translating data transformation natural language prompts into a visual workflow pipeline.\n"
            f"Available columns in the original dataset: {req.columns}\n\n"
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
            "You will receive the current list of nodes (with their `id`, `type`, `subtype`, `label`, `config`) and the current list of edges.\n"
            "You must modify the current workflow dynamically according to the user's latest prompt. You can append new nodes, modify existing nodes, or delete nodes from the list of nodes as instructed.\n"
            "Rules for modifying the workflow:\n"
            "1. For any existing node that you keep or modify, you MUST preserve its `id` exactly. Do not generate a new id for an existing node.\n"
            "2. For new nodes, generate a new unique string id (e.g., 'add_col_3').\n"
            "3. A new task is considered DEPENDENT on a previous step ONLY if the user prompt explicitly asks to modify/edit a previous step (e.g. 'change hii formula to...') OR if the new task's formula/config references a column that was created/generated by a previous step. In ALL other cases (even if the new task references the same original columns as a previous task, such as 'AGE'), the new task is COMPLETELY INDEPENDENT. Independent tasks MUST run in separate, parallel paths. You MUST NOT daisy-chain independent tasks sequentially or draw edges between their intermediate nodes.\n"
            "4. Every independent task/path must run in a completely separate parallel path. The execution engine automatically merges all parallel branches row-by-row at the final output node (e.g. if Path A adds column 'hii' and Path B adds column 'hii2' in parallel, the final CSV will automatically contain both columns). Therefore, you MUST NOT connect parallel paths to each other or join them before the final output node. Every independent path must start directly from the source node and its final node must connect directly to the final output node.\n"
            "Example of 3 independent parallel tasks (creating column 'hii', creating column 'hii2', and conditionally updating 'SEX'):\n"
            "Nodes:\n"
            "- source_node (type: source)\n"
            "- add_col_1 (config: targetColumn: 'hii')\n"
            "- add_col_2 (config: targetColumn: 'hii2')\n"
            "- add_col_3 (config: targetColumn: 'SEX')\n"
            "- export_node (type: output)\n"
            "Edges:\n"
            "- source_node -> add_col_1\n"
            "- add_col_1 -> export_node\n"
            "- source_node -> add_col_2\n"
            "- add_col_2 -> export_node\n"
            "- source_node -> add_col_3\n"
            "- add_col_3 -> export_node\n"
            "Notice that there are NO edges between add_col_1, add_col_2, and add_col_3! They are completely disjoint between source_node and export_node.\n"
            "5. If the user asks to modify a task or add a step sequential to a specific task, place it in that task's path.\n"
            "6. If the user asks to delete a step, remove the node and reconnect edges accordingly.\n\n"
            "Output ONLY a JSON object containing:\n"
            "{\n"
            "  \"explanation\": \"A short, friendly message explaining what changes you made to the workflow\",\n"
            "  \"nodes\": [\n"
            "     // Include ALL nodes in the workflow, including the source (type: 'source', subtype: 'csv') and output (type: 'output', subtype: 'csv') nodes!\n"
            "     // Nodes must have a unique string id (e.g. \"source_node\", \"add_col_1\", \"export_node\"), type, subtype, label, config.\n"
            "     ...\n"
            "  ],\n"
            "  \"edges\": [\n"
            "     // Include ALL edges/connections between nodes.\n"
            "     // Each edge has \"from\": \"<node_id>\", \"to\": \"<node_id>\".\n"
            "     // For parallel tasks, draw edges from the source node to the start of each path, and from the end of each path to the final output node.\n"
            "     ...\n"
            "  ]\n"
            "}\n\n"
            "Rules:\n"
            "- Fuzzy-match user column references against the available columns list where appropriate.\n"
            "- Do not wrap in markdown ```json blocks or provide any text explanations outside the JSON."
        )
        history_str = json.dumps([{"role": m.role, "content": m.content} for m in req.history])
        nodes_str = json.dumps(req.current_nodes)
        edges_str = json.dumps(req.current_edges)
        user_message_text = (
            f"Current Workflow Nodes: {nodes_str}\n"
            f"Current Workflow Edges: {edges_str}\n"
            f"Chat History: {history_str}\n"
            f"User Prompt: {req.prompt}"
        )
    else:
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
            "   Config: {\"subtype\": \"delete_column\", \"columns\": [\"<col1> \", \"<col2>\"]}\n"
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
        user_message_text = f"User Prompt: {req.prompt}"

    payload = {
        "contents": [{
            "parts": [{"text": user_message_text}]
        }],
        "systemInstruction": {
            "parts": [{"text": system_instruction}]
        },
        "generationConfig": {
            "responseMimeType": "application/json"
        }
    }

    models = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.5-flash"]
    last_error_msg = ""

    for model in models:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={gemini_key}"
        logger.info(f"Attempting prompt compilation with model: {model}")
        try:
            async with httpx.AsyncClient() as client:
                res = await client.post(url, json=payload, timeout=30.0)
                if res.status_code != 200:
                    logger.warning(f"Model {model} failed with status {res.status_code}: {res.text}")
                    last_error_msg = f"Model {model} returned {res.status_code}: {res.text}"
                    continue
                
                data = res.json()
                text_response = data["candidates"][0]["content"]["parts"][0]["text"].strip()
                logger.info(f"Model {model} response text: {text_response}")
                
                parsed = json.loads(text_response)
                if req.chat_mode:
                    if isinstance(parsed, list):
                        parsed = {
                            "explanation": "I have updated the workflow with the requested changes.",
                            "nodes": parsed
                        }
                    elif isinstance(parsed, dict):
                        if "nodes" not in parsed:
                            if "subtype" in parsed or "type" in parsed:
                                parsed = {
                                    "explanation": parsed.get("explanation") or "I have updated the workflow with the requested changes.",
                                    "nodes": [parsed]
                                }
                            else:
                                parsed = {
                                    "explanation": "I have updated the workflow.",
                                    "nodes": []
                                }
                else:
                    if not isinstance(parsed, list):
                        parsed = [parsed] if isinstance(parsed, dict) else []
                    
                logger.info(f"Successfully compiled prompt using model {model}")
                return parsed
        except Exception as e:
            logger.warning(f"Exception during request for model {model}: {str(e)}")
            last_error_msg = f"Model {model} exception: {str(e)}"
            continue

    logger.error(f"All Gemini models failed to compile prompt. Last error: {last_error_msg}")
    raise HTTPException(status_code=500, detail=f"Prompt compilation failed: {last_error_msg}")

# Mount Frontend static directory (Serves index.html at root "/")
frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../frontend"))
logger.info(f"Mounting static files from {frontend_dir}")
app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
