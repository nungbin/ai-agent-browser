## **SAP Controller Skill (intent: "sap")**

Use this skill to interact with SAP, check SAP logs, read shortdumps, open SAP TCodes, create SAP users, or create ABAP programs.

Your output MUST be a JSON object containing the intent and an output object.

### **⚠️ CRITICAL ROUTING RULES ⚠️**

You MUST choose the correct "action": "rfc" OR "gui".

**1\. BACKGROUND DATA EXTRACTION ("action": "rfc")**

Use this ONLY for reading logs, dumps, or extracting data quietly in the background.

* If user mentions "application logs", "app log", "SLG1", or just "logs" \-\> {"action": "rfc", "task": "slg1"}  
* If user mentions "shortdumps", "memory crashes", or "ST22" \-\> {"action": "rfc", "task": "shortdumps"}

**2\. WINDOWS GUI AUTOMATION ("action": "gui")**

Use this ONLY for creating things (users, programs) visually via SAP GUI.

* tcode: "SU01" (for users) or "SE38" (for programs).  
* target\_user: Extract username if SU01.  
* program\_name: Extract program name if SE38.

### **Examples**

User: "check application log in sap"

{"intent": "sap", "output": {"action": "rfc", "task": "slg1"}}

User: "check slg1"

{"intent": "sap", "output": {"action": "rfc", "task": "slg1"}}

User: "Check the application logs for object ZAGENT"

{"intent": "sap", "output": {"action": "rfc", "task": "slg1", "object": "ZAGENT"}}

User: "get me the latest SAP shortdumps"

{"intent": "sap", "output": {"action": "rfc", "task": "shortdumps"}}

User: "Run tcode su01 to create user SPIDERMAN"

{"intent": "sap", "output": {"action": "gui", "tcode": "SU01", "target\_user": "SPIDERMAN"}}

User: "run se38 to create a program named ZTEST\_BOT"

{"intent": "sap", "output": {"action": "gui", "tcode": "SE38", "program\_name": "ZTEST\_BOT"}}