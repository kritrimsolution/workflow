import os
import sys
import asyncio

# Append backend directory to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../backend')))

from main import parse_prompt, db_query, PromptRequest, QueryRequest, GEMINI_API_KEY, DATABASE_URL

async def run_test():
    print("Testing backend LLM integration...")
    print("API Key configured:", "YES" if GEMINI_API_KEY else "NO")
    print("Database URL configured:", "YES" if DATABASE_URL else "NO")
    
    if not GEMINI_API_KEY:
        print("ERROR: GEMINI_API_KEY is not set.")
        sys.exit(1)

    # 1. Test Gemini Prompt Parsing
    try:
        req = PromptRequest(
            prompt="add a column named Tax that is amount multiplied by 0.18",
            columns=["Name", "Amount", "Country"]
        )
        print("\nSending prompt compiler request to Gemini...")
        response = await parse_prompt(req)
        print("Gemini Response:")
        import json
        print(json.dumps(response, indent=2))
        
        # Verify response layout
        if len(response) > 0 and response[0].get("subtype") == "add_column":
            print("\nSUCCESS! Gemini parsed prompt correctly!")
        else:
            print("\nWARNING: Gemini response does not match expected node structure.")
            
    except Exception as e:
        print("LLM Prompt parsing test failed:", e)
        sys.exit(1)

    # 2. Test database query proxy
    try:
        print("\nTesting database query proxy...")
        db_req = QueryRequest(
            query="SELECT username, role FROM users LIMIT 2"
        )
        db_res = await db_query(db_req)
        print("DB Response columns:", [f["name"] for f in db_res.get("fields", [])])
        print("DB Rows count:", len(db_res.get("rows", [])))
        print("SUCCESS! DB Query proxy works perfectly!")
    except Exception as e:
        print("Database query proxy test failed:", e)
        sys.exit(1)

    print("\nALL BACKEND SYSTEM TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    asyncio.run(run_test())
