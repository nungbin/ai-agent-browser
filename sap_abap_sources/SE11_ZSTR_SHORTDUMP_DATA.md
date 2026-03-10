# **SE11 Dictionary Setup: ZSTR\_SHORTDUMP\_DATA**

To allow the Node.js agent to receive shortdump data via the Z\_GET\_LATEST\_DUMPS RFC, you must create a custom Data Structure in the SAP ABAP Dictionary so the backend knows how to format the response payload.

## **Prerequisites**

* SAP GUI Access  
* Developer Key / Authorization to create Dictionary objects (Transaction SE11)

## **Step-by-Step Instructions**

1. **Open Transaction SE11**  
   Log into your SAP system and execute transaction SE11 (ABAP Dictionary).  
2. **Create the Structure**  
   * Select the **Data type** radio button.  
   * Enter ZSTR\_SHORTDUMP\_DATA in the input field.  
   * Click **Create**.  
   * In the dialog box that appears, select **Structure** and hit Enter (✓).  
3. **Define Structure Attributes**  
   * **Short Description:** Payload structure for Node.js AI AI Agent Shortdumps  
4. **Add Components (Fields)**  
   Go to the **Components** tab and add the following fields exactly as shown. Set the Typing Method to Types for all of them:

| Component | Typing Method | Component Type | Description |
| :---- | :---- | :---- | :---- |
| DATUM | Types | SYDATUM | Date of the Shortdump |
| UZEIT | Types | SYUZEIT | Time of the Shortdump |
| UNAME | Types | SYUNAME | User who triggered the dump |
| DUMP\_TEXT | Types | STRING | The raw binary/text crash trace |

5.   
   *(Note: Using STRING for DUMP\_TEXT is crucial because memory dumps are dynamically sized and can be quite large. Standard CHAR types will truncate the AI's context).*  
6. **Save and Activate**  
   * Click the **Save** (Ctrl+S) icon.  
   * Assign it to your custom Package (e.g., Z\_AGENT) or save it as a Local Object ($TMP) if you don't plan on transporting it.  
   * Click the **Activate** (Ctrl+F3) icon (the matchstick icon).  
   * Ensure there are no errors in the activation log.

## **Verification**

Once this structure is active, you can safely activate the Z\_GET\_LATEST\_DUMPS Function Module in SE37. The node-rfc library will automatically read this SE11 metadata over the TCP connection and map it directly into a JavaScript Array of Objects\!