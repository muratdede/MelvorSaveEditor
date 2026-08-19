# Melvor Save JSON Editor Injector

This tool is designed to run directly inside the Melvor Idle page using the Chrome DevTools Console.

## How to Run

1. Open Melvor Idle in Google Chrome:
   `https://www.melvoridle.com/`

2. Wait until the game and your character are fully loaded.

3. Open Chrome DevTools:
   - Press `F12`, or
   - Press `Ctrl + Shift + I`

4. Open the **Console** tab.

5. Drag the `inject.js` file from File Explorer directly into the Chrome Console.

6. Chrome will paste the contents of the file into the Console.

7. Press `Enter` to execute it.

8. The save editor interface should appear on top of the game.

## Usage

- Paste your Melvor save string into the **Save String** field.
- Click **Decode** to load the save and display the editable save data as JSON.
- Edit the JSON values you want to change.
- Click **Encode** to apply the changes and generate a new save string.
- Copy the generated save string from the output field.

## Important

- Run the injector only after Melvor Idle has fully loaded.
- The script must be executed inside the Melvor Idle page. Opening `inject.js` or a separate HTML file directly will not work because it needs access to the game's `game` and `SaveWriter` objects.
- Keep a backup of your original save before making any changes.
- Invalid JSON or unsupported changes may cause save generation to fail.

## Chrome Paste Warning

Chrome may sometimes block pasted code in DevTools and display a warning about self-XSS.

If Chrome asks you to allow pasting, follow the instruction shown by Chrome in the Console, then drag `inject.js` into the Console again and press `Enter`.
