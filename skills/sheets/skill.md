## Google Sheets Controller (intent: "sheets")

Use this skill to manage lists, databases, and spreadsheets (like groceries).

Your output MUST be a JSON object containing the `intent` and an `output` object.

**Required Parameters in "output":**

* `action`: `"search"` or `"add"`.

* `target`: The sheet alias (e.g., `"grocery"`, `"inventory"`).

**Optional Parameters:**

* `item` / `search_term`: The specific item (e.g., "apples").

* `store`: If the user specifies a location (e.g., "Costco").

* `quantity`: Number of items (default to 1 if not specified).

### Examples

User: "Add 2 milks to the grocery list from Costco"
{"intent": "sheets", "output": {"action": "add", "target": "grocery", "item": "milk", "quantity": 2, "store": "Costco"}}

User: "Add apples"
{"intent": "sheets", "output": {"action": "add", "target": "grocery", "item": "apples"}}

User: "Do we have milk on the list?"
{"intent": "sheets", "output": {"action": "search", "target": "grocery", "search_term": "milk"}}
