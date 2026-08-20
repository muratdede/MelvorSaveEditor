# Melvor Save Editor

Melvor Save Editor is a simple save editing tool for Melvor Idle.

It is designed to be easy to use.

## Supported Browsers

The automatic launcher currently supports:

- Google Chrome
- Microsoft Edge
- Mozilla Firefox
- Brave
- Opera

If your default browser is not supported by the automatic launcher, you can still use Melvor Save Editor manually from your browser's JavaScript Console. See **Manual Injection** below.

## How to Use

1. Double-click:

   `START.bat`

2. Your default browser will open Melvor Idle automatically.

3. Wait for Melvor Idle and your character to finish loading.

4. The **Melvor Save Editor** window should appear automatically on top of the game.

That is all. You do not need to do anything else.

## Manual Injection

If your browser is not supported by the automatic launcher, you can run the editor manually.

1. Open Melvor Idle in your browser:

   `https://www.melvoridle.com/`

2. Wait until the game and your character are fully loaded.

3. Open your browser's Developer Tools.

   Common shortcuts are:

   - `F12`
   - `Ctrl + Shift + I`
   - On macOS: `Cmd + Option + I`

4. Open the **Console** tab.

5. Open the included:

   `melvor_save_editor.js`

6. Copy the entire contents of the file.

7. Paste the code into the browser Console.

8. Press `Enter`.

The **Melvor Save Editor** window should appear on top of the game.

> Some browsers may display a warning before allowing JavaScript to be pasted into the Console. Follow the browser's instructions to enable pasting, then paste the script again.

## Using the Editor

### Load a Save

1. Copy your Melvor save string.
2. Paste it into the **Save String** field.
3. Click **Decode**.

The editor will load the supported save data.

### Currency

Open the **Currency** section to view and edit supported currencies.

Change the amount of a currency directly in its input field.

### Skills

Open the **Skills** section to view:

- Skill name
- Current level
- Current XP
- Level cap

To increase a skill's XP:

1. Enter the amount of XP you want to add.
2. Click **Add XP**.

XP is added through Melvor's own skill system instead of directly overwriting the skill level.

### Bank Items

Open the **Bank Items** section to view the items currently stored in the bank.

You can edit item quantities and supported item information.

When an item ID is changed, the editor resolves the item through Melvor's item registry so the game receives a real item object instead of only a text ID.

## Generate the New Save

After making your changes:

1. Click **Encode Save**.
2. Copy the generated save string.
3. Import the new save string into Melvor Idle.

## First Launch

The launcher uses a separate browser profile for Melvor Save Editor.

Because of this, you may need to sign in to Melvor Idle or Steam on the first launch.

Your login session is stored in that dedicated profile and should remain available for later launches.

The profile is stored at:

`%LOCALAPPDATA%\MelvorSaveEditor\Profiles`

## Important

- Always keep a backup of your original save before making changes.
- Wait until Melvor Idle has fully loaded before using the editor.
- Invalid changes may produce an unusable save.
- This tool modifies save data. Use it at your own risk.