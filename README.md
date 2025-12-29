# DarkWold

A browser extension for Firefox and Chrome that transforms WoldianGames pages into a cleaner, more readable dark-themed format.

## Features

### Dark Theme
- Dark background with improved readability
- Consistent color scheme across all pages
- Styled tables, links, and form elements
- Custom scrollbar styling

### Character Posts
- Restructured posts with header, body, and footer sections
- Character names and dice rolls grouped in the header
- Datetime displayed in the footer
- Special styling for DM/GM posts (detected by (DM), (GM), etc. in headers)
- Removed borders and reduced spacing between posts
- All post links open in new tabs

### BBCode Toolbar
- Toolbar with buttons for common BBCode tags (Dialogue, OOC, Bold, Italic, Underline, Link, Center, Blockquote, Spoiler)
- Message preview that updates automatically as you type
- Refresh Preview button below the "Message:" label
- Available on both new post forms and edit post forms

### Post Form Enhancements
- **Modern Form Layout**: Transformed from table-based to clean, intuitive div-based layout
- **New Post Detection**: Automatically monitors for new posts while you're writing
  - Checks for new posts every 2 minutes
  - Pauses checks while you're actively typing
  - Compares post datetimes to detect truly new content
- **Submission Confirmation**: Two-step confirmation process when submitting posts
  - First: Warns if new posts have been detected since you started writing
  - Second: General confirmation to prevent accidental submissions
- **New Post Indicator**: Visual alert displayed below the submit button when new posts are detected
- **Edit Post Support**: Edit post pages are fully styled with dark theme and modern form layout

### Page Support
The extension works on:
- Game pages (`/games/index.php*`)
- Archive pages (`/archives/index.php*` and `//archives/index.php*`)
- Edit post pages (`/include/layout/editPost.php*`)
- Main index page (`woldiangames.htm`)
- Career games index (`games_index_career.htm`)
- Giggling Ghost & Tapestry games index (`games_index_gg_tap.htm`)
- Discussion boards index (`games_index_discussion.htm`)
- Welcome page (`welcome/welcome.html`)

### Additional Features
- Spoiler tags transformed to "Highlight to display spoiler" format
- Header section navigation styling
- Report button table styling for dark theme
- Edit Post links work correctly (preserves javascript: protocol links)
- All post links open in new tabs (except Edit Post links)

## Installation

### Chrome/Edge

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select this extension directory
5. The extension will now be active on WoldianGames pages

### Firefox

1. Open Firefox and navigate to `about:debugging`
2. Click "This Firefox" in the left sidebar
3. Click "Load Temporary Add-on..."
4. Navigate to this extension directory and select `manifest.json`
5. The extension will now be active on WoldianGames pages

## Usage

The extension automatically activates when you visit supported WoldianGames pages. No additional configuration needed - just install and browse!

## Development

To modify the extension:

- `manifest.json` - Extension configuration and permissions
- `content.js` - JavaScript that transforms the page structure
- `styles.css` - CSS styling for the transformed page

After making changes:
- Chrome: Go to `chrome://extensions/` and click the refresh icon on the extension card
- Firefox: Reload the extension from `about:debugging`

## Notes

This extension uses the WebExtensions API and is compatible with both Chrome and Firefox. It only modifies the appearance of pages - it doesn't change any functionality or send data anywhere.

