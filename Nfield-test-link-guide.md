# Where to get the Nfield test link

Use this link in your `.env` as: **`VITE_NFIELD_TEST_LINK=<the URL you copy>`**

---

## Option 1: Via Nfield API (recommended)

### 1. Open the API docs
- **Go to:** [https://api.nfieldmr.com/swagger/index.html](https://api.nfieldmr.com/swagger/index.html)
- **Click:** the **"Select a definition"** dropdown
- **Choose:** **V2**

### 2. Find the Public IDs endpoint
- In the left menu, scroll to the section **"Surveys - Public Ids"**
- **Click:** **"GET /v2/surveys/{surveyId}/publicIds"**

### 3. Get your token
- **Click:** **"POST /v2/token"** (under **Token** or **Access**)
- **Click:** **"Try it out"**
- Fill in the body (domain: `ic`, username, password)
- **Click:** **"Execute"**
- **Copy** the `access_token` from the response (you need it in the next step)

### 4. Call Public IDs
- Go back to **GET /v2/surveys/{surveyId}/publicIds**
- **Click:** **"Try it out"**
- **Enter:** your **surveyId** (the Nfield survey ID)
- **Click:** the **Authorize** lock at the top and paste your token, then **Authorize**
- **Click:** **"Execute"**

### 5. Copy the test URL
- In the **Response body** you get a list of public IDs:
  - **Internal test** – for testers inside your org  
  - **External test** – for external test respondents  
  - **Live** – for real respondents  
- **Copy** the full **URL** of the one you want (usually **External test** for preview).
- Paste it in `.env`:
  ```env
  VITE_NFIELD_TEST_LINK=https://...the URL you copied...
  ```
- Restart your app (`npm run dev` or your dev command).

---

## Option 2: Via Nfield Manager (web UI)

### 1. Log in
- **Go to:** your Nfield Manager URL (your org or NIPO will give you this; often something like `https://manager.nfieldmr.com` or a custom domain).
- **Log in** with your Nfield account.

### 2. Open your survey
- In the main menu, **click:** **Surveys** (or **Survey list**).
- **Click** the **name** of the survey you use for testing.

### 3. Find the test link
- Inside the survey, look for one of these (names can vary):
  - **"Fieldwork"** or **"Interview"** → then **"Test link"** / **"Interview link"**
  - **"Public IDs"** or **"Survey links"**
  - **"Distribution"** or **"Links"**
- **Click** that section.
- You should see:
  - **Internal test** link  
  - **External test** link  
- **Click** **Copy** next to the link you want (usually **External test**), or select and copy the URL.

### 4. Put it in `.env`
- Open your project’s **`.env`** file.
- Add or edit:
  ```env
  VITE_NFIELD_TEST_LINK=https://...pasted URL...
  ```
- Save the file and **restart** your dev server.

---

## Quick checklist

| Step | Where to go | What to click |
|------|-------------|----------------|
| API | [api.nfieldmr.com/swagger](https://api.nfieldmr.com/swagger/index.html) | Select **V2** → **Surveys - Public Ids** → **GET .../publicIds** → Try it out → Execute |
| API | Response of GET publicIds | Copy the **URL** for **External test** (or Internal test) |
| Manager | Nfield Manager → Surveys | Your survey name → **Fieldwork** / **Public IDs** / **Test link** → Copy the test URL |
| App | Your project `.env` | Add `VITE_NFIELD_TEST_LINK=<paste URL here>` |

If your Manager menu looks different, check your Nfield manual or ask your admin where **Test link** or **Public IDs** are for an Online survey.
