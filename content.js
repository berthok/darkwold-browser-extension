// Content script to transform WoldianGames page format

(function() {
    'use strict';

    // Wait for DOM to be fully loaded
    function init() {
        const body = document.body;
        if (body) {
            transformPage();
        }
    }

    function transformPage() {
        // Mark body as transformed
        document.body.classList.add('wold-transformed');
        
        // Check if this is a game/index page (has character posts)
        const isGamePage = window.location.href.includes('/games/index.php') || 
                          window.location.href.includes('/archives/index.php');
        
        if (isGamePage) {
            // Transform character posts
            transformCharacterPosts();
            
            // Style dice rolls
            styleSpecialElements();
            
            // Add BBCode toolbar to form
            addBBCodeToolbar();
            
            // Make post links open in new tabs
            makePostLinksOpenInNewTabs();
            
            // Transform spoiler tags in posts
            transformSpoilerTags();
        }
        
        // Transform navigation and headers (applies to all pages)
        transformNavigation();
        
        // Style report button table
        styleReportButtonTable();
    }
    
    function transformSpoilerTags() {
        // Find all spoiler elements in posts (they have class "spoiler" from server rendering)
        const spoilerElements = document.querySelectorAll('.character-post .spoiler, .post-body-section .spoiler');
        
        spoilerElements.forEach(spoiler => {
            // Check if already transformed
            if (spoiler.classList.contains('spoiler-transformed')) return;
            
            const content = spoiler.textContent || spoiler.innerHTML;
            
            // Create new element with the "Highlight to display spoiler: {content}" format
            const newElement = document.createElement('span');
            newElement.className = 'spoiler-display';
            newElement.innerHTML = `Highlight to display spoiler: <span class="spoiler-content">${content}</span>`;
            
            // Replace the old spoiler element
            spoiler.parentNode.replaceChild(newElement, spoiler);
        });
    }

    function transformCharacterPosts() {
        // Find all comment nodes - work backwards to avoid issues with DOM changes
        const comments = [];
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_COMMENT,
            null,
            false
        );

        let node;
        while (node = walker.nextNode()) {
            const commentText = node.textContent.trim();
            if (commentText === 'START NEW POST' || commentText === 'End Show Posts') {
                comments.push({ node: node, type: commentText });
            }
        }

        // Process each post between START NEW POST comments (work backwards)
        for (let i = comments.length - 2; i >= 0; i--) {
            if (comments[i].type === 'START NEW POST') {
                const startComment = comments[i].node;
                
                // Check if already wrapped
                let nextSibling = startComment.nextSibling;
                if (nextSibling && nextSibling.nodeType === Node.ELEMENT_NODE && 
                    nextSibling.classList && nextSibling.classList.contains('character-post')) {
                    continue; // Already wrapped
                }
                
                // Find the end of this post (next START NEW POST or hrThin div or End Show Posts)
                const postNodes = [];
                let currentNode = startComment.nextSibling;
                let foundEnd = false;
                
                while (currentNode && !foundEnd) {
                    // Check if this is the end comment
                    if (currentNode.nodeType === Node.COMMENT_NODE) {
                        const commentText = currentNode.textContent.trim();
                        if (commentText === 'START NEW POST' || commentText === 'End Show Posts') {
                            foundEnd = true;
                            break;
                        }
                    }
                    
                    // Stop if we hit an hrThin div (post separator)
                    if (currentNode.nodeType === Node.ELEMENT_NODE && 
                        currentNode.classList && 
                        currentNode.classList.contains('hrThin')) {
                        foundEnd = true;
                        break;
                    }
                    
                    // Collect meaningful nodes
                    if (currentNode.nodeType === Node.ELEMENT_NODE) {
                        postNodes.push(currentNode);
                    } else if (currentNode.nodeType === Node.TEXT_NODE && currentNode.textContent.trim()) {
                        postNodes.push(currentNode);
                    }
                    
                    currentNode = currentNode.nextSibling;
                }
                
                // Wrap the post if we found content
                if (postNodes.length > 0) {
                    wrapPostContent(postNodes, startComment);
                }
            }
        }
    }

    function wrapPostContent(nodes, startComment) {
        if (nodes.length === 0) return;
        
        // Check if already wrapped
        const firstNode = nodes[0];
        if (firstNode.parentElement && firstNode.parentElement.classList.contains('character-post')) {
            return;
        }
        
        const container = document.createElement('div');
        container.className = 'character-post';
        
        const parent = startComment.parentNode;
        if (!parent) return;
        
        // Insert container right after the START NEW POST comment
        if (startComment.nextSibling) {
            parent.insertBefore(container, startComment.nextSibling);
        } else {
            parent.appendChild(container);
        }
        
        // Move all nodes into container (they will be removed from their current position)
        const nodesToMove = [...nodes]; // Create a copy since we'll be modifying the DOM
        nodesToMove.forEach(node => {
            if (node.parentNode) {
                container.appendChild(node);
            }
        });
        
        // Style the post content
        stylePostContent(container);
    }

    function stylePostContent(container) {
        // Collect all elements we need to reorganize
        const bigElement = container.querySelector('big');
        const fontElements = Array.from(container.querySelectorAll('font[size="-1"]'));
        const hrThinElements = Array.from(container.querySelectorAll('.hrThin'));
        
        // Find font element with dice rolls and/or datetime
        let diceRollsText = '';
        let datetimeText = '';
        let fontElementToRemove = null;
        
        fontElements.forEach(font => {
            const text = font.textContent || '';
            const html = font.innerHTML || '';
            
            // Check if it contains dice rolls or datetime
            const hasDiceRolls = text.match(/d\d+\+?\d*=?\d+/);
            const hasDateTime = text.match(/\w+day\s+\w+\s+\d+[a-z]{0,2},\s+\d{4}\s+\d+:\d+:\d+\s+(AM|PM)/);
            
            if (hasDiceRolls || hasDateTime) {
                fontElementToRemove = font;
                
                // Split the content - dice rolls come before the <br>, datetime after
                const parts = html.split(/<br\s*\/?>/i);
                
                // First part(s) contain dice rolls
                for (let i = 0; i < parts.length - 1; i++) {
                    const part = parts[i].trim();
                    // Remove &nbsp; and clean up
                    const cleanPart = part.replace(/&nbsp;/g, ' ').trim();
                    if (cleanPart.match(/d\d+\+?\d*=?\d+/)) {
                        diceRollsText += (diceRollsText ? ' ' : '') + cleanPart;
                    }
                }
                
                // Last part contains datetime
                const lastPart = parts[parts.length - 1].trim();
                const cleanLastPart = lastPart.replace(/&nbsp;/g, ' ').trim();
                if (cleanLastPart.match(/\w+day\s+\w+\s+\d+[a-z]{0,2},\s+\d{4}\s+\d+:\d+:\d+\s+(AM|PM)/)) {
                    datetimeText = cleanLastPart;
                }
            }
        });
        
        // Collect all body content (everything except header, font with dice/datetime, and hrThin)
        const bodyContent = [];
        const allNodes = Array.from(container.childNodes);
        
        allNodes.forEach(node => {
            // Skip elements we're processing separately
            if (node === bigElement || 
                node === fontElementToRemove ||
                (node.nodeType === Node.ELEMENT_NODE && hrThinElements.includes(node))) {
                return;
            }
            
            // Skip empty text nodes and &nbsp;
            if (node.nodeType === Node.TEXT_NODE) {
                const trimmed = node.textContent.trim();
                if (trimmed === '' || trimmed === '&nbsp;') {
                    return;
                }
            }
            
            bodyContent.push(node);
        });
        
        // Create new structure
        const postHeader = document.createElement('div');
        postHeader.className = 'post-header-section';
        
        const postBody = document.createElement('div');
        postBody.className = 'post-body-section';
        
        const postFooter = document.createElement('div');
        postFooter.className = 'post-footer-section';
        
        // Add header (big element)
        if (bigElement) {
            const headerClone = bigElement.cloneNode(true);
            const bold = headerClone.querySelector('b');
            if (bold) {
                bold.classList.add('character-post-header');
                // Remove any inline color styles to ensure CSS applies
                bold.style.color = '';
            }
            // Also remove inline styles from the big element itself
            if (headerClone.style) {
                headerClone.style.color = '';
            }
            
            // Check if this is a DM/GM post - check entire header text
            const headerText = bigElement.textContent || bigElement.innerText || '';
            // Check for DM/GM indicators: (DM, (Dm, (DMs, (Dms, (GM, (Gm, (GMs, (Gms
            // Also check without parentheses and with spaces
            const isDMGM = /\(?\s*(DM|Dm|DMs|Dms|GM|Gm|GMs|Gms)\s*\)?/i.test(headerText);
            if (isDMGM) {
                container.classList.add('dm-gm-post');
                console.log('DM/GM post detected:', headerText);
            }
            
            postHeader.appendChild(headerClone);
        }
        
        // Add dice rolls to header section
        if (diceRollsText) {
            const diceRollsElement = document.createElement('div');
            diceRollsElement.className = 'post-dice-rolls';
            // Add dice emoji label and preserve spacing and formatting for dice rolls
            diceRollsElement.innerHTML = '🎲 ' + diceRollsText.replace(/\s+/g, ' ').trim();
            postHeader.appendChild(diceRollsElement);
        }
        
        // Add body content
        bodyContent.forEach(node => {
            if (node.parentNode === container) {
                postBody.appendChild(node);
            }
        });
        
        // Add datetime to footer
        if (datetimeText) {
            const datetimeElement = document.createElement('div');
            datetimeElement.className = 'post-datetime';
            datetimeElement.textContent = datetimeText;
            postFooter.appendChild(datetimeElement);
        }
        
        // Clear container and rebuild with new structure
        container.innerHTML = '';
        container.appendChild(postHeader);
        if (postBody.childNodes.length > 0) {
            container.appendChild(postBody);
        }
        if (postFooter.childNodes.length > 0) {
            container.appendChild(postFooter);
        }
    }

    function transformNavigation() {
        // Transform navigation elements
        const links = document.querySelectorAll('a[href*="woldiangames"]');
        links.forEach(link => {
            link.classList.add('nav-link');
        });

        // Find and style view preference links
        const viewPrefs = document.querySelectorAll('a[href^="javascript:void setView"]');
        viewPrefs.forEach(link => {
            link.classList.add('view-preference');
        });
        
        // Mark header section
        markHeaderSection();
        
        // Ensure form container is visible
        const withjsContainer = document.querySelector('.withjs');
        if (withjsContainer) {
            withjsContainer.classList.remove('hide');
            withjsContainer.style.display = 'block';
        }
        
        // Style form elements
        styleFormElements();
    }
    
    function markHeaderSection() {
        // Find all comment nodes
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_COMMENT,
            null,
            false
        );
        
        let startComment = null;
        let endComment = null;
        let node;
        
        while (node = walker.nextNode()) {
            const commentText = node.textContent.trim();
            if (commentText === 'START HEADER') {
                startComment = node;
            } else if (commentText === 'END HEADER') {
                endComment = node;
                break;
            }
        }
        
        if (startComment && endComment) {
            // Find all elements between the comments
            let current = startComment.nextSibling;
            while (current && current !== endComment) {
                if (current.nodeType === Node.ELEMENT_NODE) {
                    current.classList.add('header-section');
                    // Also mark nested elements
                    const nestedElements = current.querySelectorAll('*');
                    nestedElements.forEach(el => {
                        el.classList.add('header-section');
                    });
                }
                current = current.nextSibling;
            }
            
            // Remove cellspacing and cellpadding attributes from header section tables
            const headerTables = document.querySelectorAll('.header-section table, table.header-section');
            headerTables.forEach(table => {
                table.removeAttribute('cellspacing');
                table.removeAttribute('cellSpacing');
                table.removeAttribute('cellpadding');
                table.removeAttribute('cellPadding');
                table.removeAttribute('border');
                // Also remove from all cells
                const cells = table.querySelectorAll('td, th');
                cells.forEach(cell => {
                    cell.removeAttribute('cellspacing');
                    cell.removeAttribute('cellSpacing');
                    cell.removeAttribute('cellpadding');
                    cell.removeAttribute('cellPadding');
                });
            });
        }
    }

    function styleReportButtonTable() {
        // Find the report button section by looking for the comment markers
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_COMMENT,
            null,
            false
        );
        
        let startComment = null;
        let endComment = null;
        let node;
        
        while (node = walker.nextNode()) {
            const commentText = node.textContent.trim().toLowerCase();
            if (commentText.includes('start report button')) {
                startComment = node;
            } else if (commentText.includes('end report button')) {
                endComment = node;
                break;
            }
        }
        
        if (startComment && endComment) {
            // Find the table between the comments
            let currentNode = startComment.nextSibling;
            while (currentNode && currentNode !== endComment) {
                if (currentNode.nodeType === Node.ELEMENT_NODE && currentNode.tagName === 'TABLE') {
                    // Style the table and all its cells
                    currentNode.style.backgroundColor = '#1a1a1a';
                    const cells = currentNode.querySelectorAll('td, th');
                    cells.forEach(cell => {
                        cell.style.backgroundColor = '#1a1a1a';
                        cell.style.color = 'rgb(203, 201, 201)';
                    });
                    break;
                }
                currentNode = currentNode.nextSibling;
            }
        }
    }

    function styleFormElements() {
        // Find form and mark cells that contain buttons for centering
        const form = document.querySelector('form[name="postForm"]');
        if (!form) {
            console.log('Form not found');
            return;
        }
        
        // Ensure form and its container are visible
        form.style.display = 'block';
        form.style.visibility = 'visible';
        
        const formContainer = form.closest('.withjs');
        if (formContainer) {
            formContainer.classList.remove('hide');
            formContainer.style.display = 'block';
            formContainer.style.visibility = 'visible';
        }
        
        // Mark all cells first
        const rows = Array.from(form.querySelectorAll('tr'));
        rows.forEach(row => {
            const cells = Array.from(row.querySelectorAll('td'));
            cells.forEach((cell, index) => {
                // If cell contains dice buttons or multiroll, mark it
                if (cell.querySelector('.diebutton') || cell.querySelector('#multiroll')) {
                    cell.classList.add('form-controls-cell');
                }
                // If cell contains input/textarea in second or third column, mark it
                if (index > 0 && (cell.querySelector('input[type="text"]') || cell.querySelector('textarea'))) {
                    cell.classList.add('form-input-cell');
                }
            });
        });
        
        // Restructure Click & Roll and MultiRoll rows to align with labels
        // Do this in a separate pass to avoid modifying while iterating
        const rowsToModify = [];
        rows.forEach(row => {
            const rowText = row.textContent || '';
            if ((rowText.includes('Click&Roll') || rowText.includes('MultiRoll')) && !row.querySelector('.dice-control-label')) {
                rowsToModify.push(row);
            }
        });
        
        // Now modify the rows
        rowsToModify.forEach(row => {
            const cells = Array.from(row.querySelectorAll('td'));
            
            // Find the label cell (second cell) and button cell (third cell)
            if (cells.length >= 3) {
                const firstCell = cells[0];
                const labelCell = cells[1];
                const buttonCell = cells[2];
                
                // Only proceed if first cell is empty or just has &nbsp;
                if (firstCell && labelCell && buttonCell) {
                    const firstCellText = firstCell.textContent.trim();
                    if (firstCellText === '' || firstCellText === '\u00A0' || firstCellText === '&nbsp;') {
                        const labelText = labelCell.innerHTML.trim();
                        
                        // Update first cell with the label
                        firstCell.innerHTML = labelText;
                        firstCell.className = 'dice-control-label';
                        
                        // Move buttons to second cell with colspan
                        const newSecondCell = document.createElement('td');
                        newSecondCell.colSpan = 2;
                        newSecondCell.className = 'dice-controls-cell';
                        // Move all content from button cell
                        while (buttonCell.firstChild) {
                            newSecondCell.appendChild(buttonCell.firstChild);
                        }
                        
                        // Remove old cells and add new one
                        try {
                            row.removeChild(labelCell);
                            row.removeChild(buttonCell);
                            row.appendChild(newSecondCell);
                        } catch (e) {
                            console.error('Error restructuring form row:', e);
                        }
                    }
                }
            }
        });
    }

    function styleSpecialElements() {
        // Style dice rolls, but be careful not to apply to entire post bodies
        const allElements = document.querySelectorAll('*');
        allElements.forEach(el => {
            // Skip if already inside a post body section (we handle dice rolls there separately)
            if (el.closest('.post-body-section') || el.closest('.post-dice-rolls')) {
                return;
            }
            
            // Skip if it's inside a character post
            if (el.closest('.character-post')) {
                return;
            }
            
            // Skip if it's a large container (likely the entire post)
            if (el.classList.contains('character-post') || 
                el.classList.contains('post-body-section') ||
                el.classList.contains('post-header-section') ||
                el.classList.contains('post-footer-section')) {
                return;
            }
            
            // Only style dice rolls if they're small inline elements, not large containers
            // Check if the element is mostly dice rolls (not a large text block)
            const text = el.textContent || '';
            if (text.match(/d\d+\+\d+=\d+/)) {
                const diceMatches = text.match(/d\d+\+\d+=\d+/g) || [];
                const diceTextLength = diceMatches.join(' ').length;
                // Only apply if dice rolls are a significant portion (not just a small part of large text)
                if (diceTextLength > 0 && (diceTextLength / text.length > 0.3 || text.length < 100)) {
                    // Make sure it's not a large container
                    if (text.length < 200 && !el.closest('.character-post')) {
                        el.classList.add('dice-roll');
                    }
                }
            }
        });
    }

    function addBBCodeToolbar() {
        try {
            // Find the message textarea - try multiple selectors
            let messageTextarea = document.getElementById('message');
            if (!messageTextarea) {
                // Try by name attribute
                messageTextarea = document.querySelector('textarea[name="message"]');
            }
            if (!messageTextarea) {
                // Try to find any textarea in the form
                const form = document.querySelector('form[name="postForm"]');
                if (form) {
                    messageTextarea = form.querySelector('textarea');
                }
            }
            if (!messageTextarea) {
                console.log('addBBCodeToolbar: message textarea not found. Available textareas:', document.querySelectorAll('textarea').length);
                return;
            }
            
            // Check if toolbar already exists
            if (document.getElementById('bbcode-toolbar')) {
                console.log('addBBCodeToolbar: toolbar already exists');
                return;
            }
            
            // Find the parent cell/td that contains the textarea
            const textareaCell = messageTextarea.closest('td');
            if (!textareaCell) {
                console.log('addBBCodeToolbar: textarea cell not found');
                return;
            }
            
            // Create toolbar container
            const toolbar = document.createElement('div');
            toolbar.id = 'bbcode-toolbar';
            toolbar.className = 'bbcode-toolbar';
            
            // Create toolbar HTML (without preview button - it will be moved to submit row)
            toolbar.innerHTML = `
                <div class="toolbar-row">
                    <button type="button" class="bbcode-btn" data-tag="dialogue" title="Dialogue"><b>Dialogue</b></button>
                    <button type="button" class="bbcode-btn" data-tag="ooc" title="OOC"><i style="color: rgb(97, 139, 164) !important;">OOC</i></button>
                    <button type="button" class="bbcode-btn" data-tag="b" title="Bold"><b>B</b></button>
                    <button type="button" class="bbcode-btn" data-tag="i" title="Italic"><i style="color: rgb(97, 139, 164) !important;">I</i></button>
                    <button type="button" class="bbcode-btn" data-tag="u" title="Underline"><u>U</u></button>
                    <button type="button" class="bbcode-btn" data-tag="link" title="Link">Link</button>
                    <button type="button" class="bbcode-btn" data-tag="center" title="Center">Center</button>
                    <button type="button" class="bbcode-btn" data-tag="blockquote" title="Blockquote">Blockquote</button>
                    <button type="button" class="bbcode-btn" data-tag="spoiler" title="Spoiler">Spoiler</button>
                </div>
            `;
            
            // Create preview container (always visible)
            const previewContainer = document.createElement('div');
            previewContainer.id = 'bbcode-preview';
            previewContainer.className = 'bbcode-preview';
            
            // Create preview label
            const previewLabel = document.createElement('span');
            previewLabel.className = 'preview-label';
            previewLabel.textContent = 'Message Preview:';
            
            // Create wrapper for label and preview
            const previewWrapper = document.createElement('div');
            previewWrapper.className = 'preview-wrapper';
            //previewWrapper.appendChild(previewLabel);
            previewWrapper.appendChild(previewContainer);
            
            // Insert toolbar before the textarea
            textareaCell.insertBefore(toolbar, messageTextarea);
            
            // Insert preview container after the textarea
            const textareaRow = messageTextarea.closest('tr');
            if (textareaRow && textareaRow.nextSibling) {
                // Create a new row for the preview
                const previewRow = document.createElement('tr');
                const previewCell = document.createElement('td');
                previewCell.colSpan = 3;
                previewCell.appendChild(previewWrapper);
                previewRow.appendChild(previewCell);
                textareaRow.parentNode.insertBefore(previewRow, textareaRow.nextSibling);
            } else {
                // Fallback: insert after textarea cell
                textareaCell.parentNode.insertBefore(previewWrapper, textareaCell.nextSibling);
            }
            
            // Initialize preview with empty content
            showPreview(messageTextarea, previewContainer);
            
            // Add event listeners to toolbar buttons
            toolbar.addEventListener('click', function(e) {
                // Find the button element even if clicking on nested elements
                let button = e.target;
                while (button && !button.classList.contains('bbcode-btn')) {
                    button = button.parentElement;
                }
                
                if (button && button.classList.contains('bbcode-btn')) {
                    e.preventDefault();
                    e.stopPropagation();
                    const tag = button.getAttribute('data-tag');
                    handleBBCodeButton(tag, messageTextarea);
                }
            });
            
            // Add preview button next to submit button
            addPreviewButton(messageTextarea, previewContainer);
            
            console.log('addBBCodeToolbar: toolbar and preview added successfully');
        } catch (e) {
            console.error('Error in addBBCodeToolbar:', e);
        }
    }
    
    function addPreviewButton(messageTextarea, previewContainer) {
        // Check if preview button already exists
        if (document.getElementById('preview-btn')) return;
        
        // Create refresh preview button
        const previewButton = document.createElement('button');
        previewButton.type = 'button';
        previewButton.id = 'preview-btn';
        previewButton.className = 'bbcode-btn';
        previewButton.textContent = 'Refresh Preview';
        previewButton.title = 'Refresh Message Preview';
        
        // Add event listener
        previewButton.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            showPreview(messageTextarea, previewContainer);
        });
        
        // Auto-refresh preview when textarea content changes
        messageTextarea.addEventListener('input', function() {
            showPreview(messageTextarea, previewContainer);
        });
        
        // Find the row containing the message textarea
        const textareaRow = messageTextarea.closest('tr');
        if (!textareaRow) return;
        
        // Find the label cell (first cell) which contains "Message:"
        const labelCell = textareaRow.querySelector('td:first-child');
        if (!labelCell) return;
        
        // Insert preview button at the end of the label cell (below "Message:" label)
        previewButton.style.marginTop = '8px';
        previewButton.style.display = 'block';
        previewButton.style.marginLeft = 'auto';
        previewButton.style.marginRight = 'auto';
        labelCell.appendChild(previewButton);
    }
    
    function makePostLinksOpenInNewTabs() {
        // Find all links within character posts
        const postLinks = document.querySelectorAll('.character-post a[href], .post-header-section a[href]');
        
        postLinks.forEach(link => {
            // Only modify links that have an href and aren't already set to open in new tab
            if (link.href && link.target !== '_blank') {
                link.target = '_blank';
                link.rel = 'noopener noreferrer'; // Security best practice
            }
        });
    }

    function handleBBCodeButton(tag, textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const selectedText = textarea.value.substring(start, end);
        
        let openTag = '';
        let closeTag = '';
        
        switch(tag) {
            case 'dialogue':
                openTag = '[b]"';
                closeTag = '"[/b]';
                break;
            case 'ooc':
                openTag = '[i]{OOC: ';
                closeTag = '}[/i]';
                break;
            case 'b':
                openTag = '[b]';
                closeTag = '[/b]';
                break;
            case 'i':
                openTag = '[i]';
                closeTag = '[/i]';
                break;
            case 'u':
                openTag = '[u]';
                closeTag = '[/u]';
                break;
            case 'link':
                const url = prompt('Enter URL:');
                if (url) {
                    openTag = `[link href="${url}"]`;
                    closeTag = '[/link]';
                } else {
                    return;
                }
                break;
            case 'center':
                openTag = '[center]';
                closeTag = '[/center]';
                break;
            case 'blockquote':
                openTag = '[blockquote]';
                closeTag = '[/blockquote]';
                break;
            case 'spoiler':
                openTag = '[spoiler]';
                closeTag = '[/spoiler]';
                break;
        }
        
        if (openTag || closeTag) {
            const newText = textarea.value.substring(0, start) + 
                          openTag + selectedText + closeTag + 
                          textarea.value.substring(end);
            textarea.value = newText;
            textarea.focus();
            
            // Set cursor position after the inserted tag
            const newPos = start + openTag.length + selectedText.length;
            textarea.setSelectionRange(newPos, newPos);
        }
    }

    function formatBBCode(text) {
        // Handle undefined/null input
        if (text === undefined || text === null) {
            text = '';
        }
        
        // Convert to string if it's not already
        text = String(text);
        
        // Escape HTML function
        const escapeHtml = (str) => {
            if (!str) return '';
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        };
        
        // Convert newlines to a placeholder first (we'll convert back later)
        text = text.replace(/\n/g, '{{NEWLINE}}');
        
        // Convert BBCode to HTML (order matters - do more specific first)
        // Link with href attribute
        text = text.replace(/\[link href="(.*?)"\](.*?)\[\/link\]/g, (match, url, linkText) => {
            return `<a href="${escapeHtml(url)}" target="_blank" style="color: rgb(125, 164, 212);">${escapeHtml(linkText)}</a>`;
        });
        // Link without href
        text = text.replace(/\[link\](.*?)\[\/link\]/g, (match, url) => {
            return `<a href="${escapeHtml(url)}" target="_blank" style="color: rgb(125, 164, 212);">${escapeHtml(url)}</a>`;
        });
        // Email
        text = text.replace(/\[email\](.*?)\[\/email\]/g, (match, email) => {
            return `<a href="mailto:${escapeHtml(email)}" style="color: rgb(125, 164, 212);">${escapeHtml(email)}</a>`;
        });
        // Bold
        text = text.replace(/\[b\](.*?)\[\/b\]/g, (match, content) => {
            return `<b style="color: rgb(188, 121, 121);">${escapeHtml(content)}</b>`;
        });
        // Italic
        text = text.replace(/\[i\](.*?)\[\/i\]/g, (match, content) => {
            return `<i class="preview-italic" style="color: rgb(97, 139, 164);">${escapeHtml(content)}</i>`;
        });
        // Underline
        text = text.replace(/\[u\](.*?)\[\/u\]/g, (match, content) => {
            return `<u>${escapeHtml(content)}</u>`;
        });
        // Center
        text = text.replace(/\[center\](.*?)\[\/center\]/g, (match, content) => {
            return `<div style="text-align:center;">${escapeHtml(content)}</div>`;
        });
        // Blockquote
        text = text.replace(/\[blockquote\](.*?)\[\/blockquote\]/g, (match, content) => {
            return `<blockquote style="border-left: 3px solid rgb(64, 64, 64); padding-left: 10px; margin: 10px 0;">${escapeHtml(content)}</blockquote>`;
        });
        // Spoiler - convert [spoiler]content[/spoiler] to "Highlight to display spoiler: {content}"
        text = text.replace(/\[spoiler\](.*?)\[\/spoiler\]/g, (match, content) => {
            return `Highlight to display spoiler: {<span class="spoiler-content" style="color: #1a1a1a; background-color: #1a1a1a;">${escapeHtml(content)}</span>}`;
        });
        
        // Escape any remaining text that wasn't part of BBCode
        // Split by HTML tags, escape non-tag parts
        const parts = text.split(/(<[^>]+>)/g);
        let result = '';
        for (let i = 0; i < parts.length; i++) {
            if (parts[i].startsWith('<') && parts[i].endsWith('>')) {
                // It's an HTML tag, keep it as-is
                result += parts[i];
            } else if (parts[i]) {
                // It's text content, escape it
                result += escapeHtml(parts[i]);
            }
        }
        
        // Convert newline placeholders back to <br>
        result = result.replace(/\{\{NEWLINE\}\}/g, '<br>');
        
        return result;
    }

    function showPreview(textarea, previewContainer) {
        if (!textarea || !previewContainer) {
            console.error('showPreview: textarea or previewContainer is missing');
            return;
        }
        
        try {
            const text = textarea.value || '';
            const formattedText = formatBBCode(text);
            
            // Always update the preview content (no toggle)
            previewContainer.innerHTML = formattedText || '<span style="color: #666; font-style: italic;">(No message to preview)</span>';
        } catch (e) {
            console.error('Error in showPreview:', e);
            previewContainer.innerHTML = '<span style="color: #ff6666; font-style: italic;">Error generating preview</span>';
        }
    }

    function insertCharacterTemplate(textarea) {
        const url = prompt("Enter the character's URL:");
        if (!url) return;
        
        const charName = prompt("Enter the character's name:");
        if (!charName) return;
        
        const playerName = prompt("Enter the player's name:");
        if (!playerName) return;
        
        const ac = prompt("Enter the Armor Class (AC):");
        if (!ac) return;
        
        const pp = prompt("Enter the Passive Perception (PP):");
        if (!pp) return;
        
        const hpCurrent = prompt("Enter the Current HP:");
        if (!hpCurrent) return;
        
        const hpFull = prompt("Enter the Full HP:");
        if (!hpFull) return;
        
        const template = `[link href="${url}"]${charName}[/link] (${playerName}) -- AC ${ac} -- PP ${pp} -- HP ${hpCurrent}/${hpFull}`;
        
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const newText = textarea.value.substring(0, start) + 
                      template + 
                      textarea.value.substring(end);
        textarea.value = newText;
        textarea.focus();
        textarea.setSelectionRange(start + template.length, start + template.length);
    }

    // Run when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Also run after a short delay to catch dynamically loaded content
    setTimeout(init, 500);
    
    // Watch for dynamic content changes (throttled to avoid excessive calls)
    let observerTimeout;
    const observer = new MutationObserver(() => {
        clearTimeout(observerTimeout);
        observerTimeout = setTimeout(() => {
            transformPage();
            // Specifically ensure form is visible
            ensureFormVisible();
        }, 100);
    });
    
    if (document.body) {
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }
    
    // Function to ensure form is visible
    function ensureFormVisible() {
        const form = document.querySelector('form[name="postForm"]');
        if (form) {
            form.style.display = 'block';
            form.style.visibility = 'visible';
            form.style.opacity = '1';
            
            const formContainer = form.closest('.withjs');
            if (formContainer) {
                formContainer.classList.remove('hide');
                formContainer.style.display = 'block';
                formContainer.style.visibility = 'visible';
                formContainer.style.opacity = '1';
            }
            
            // Also ensure BBCode toolbar is added when form becomes available
            let messageTextarea = document.getElementById('message');
            if (!messageTextarea) {
                messageTextarea = document.querySelector('textarea[name="message"]');
            }
            if (!messageTextarea) {
                messageTextarea = form.querySelector('textarea');
            }
            if (messageTextarea && !document.getElementById('bbcode-toolbar')) {
                try {
                    console.log('ensureFormVisible: Attempting to add BBCode toolbar');
                    addBBCodeToolbar();
                } catch (e) {
                    console.error('Error adding BBCode toolbar:', e);
                }
            } else if (!messageTextarea) {
                console.log('ensureFormVisible: Message textarea not found in form');
            }
        }
    }
    
    // Run ensureFormVisible multiple times to catch late-loading forms
    setTimeout(ensureFormVisible, 100);
    setTimeout(ensureFormVisible, 500);
    setTimeout(ensureFormVisible, 1000);
    setTimeout(ensureFormVisible, 2000);
    setTimeout(ensureFormVisible, 3000);
    setTimeout(ensureFormVisible, 5000);
    
    // Also try to add toolbar directly after delays
    setTimeout(() => {
        if (!document.getElementById('bbcode-toolbar')) {
            console.log('Delayed attempt: Trying to add BBCode toolbar');
            addBBCodeToolbar();
        }
    }, 1000);
    setTimeout(() => {
        if (!document.getElementById('bbcode-toolbar')) {
            console.log('Delayed attempt 2: Trying to add BBCode toolbar');
            addBBCodeToolbar();
        }
    }, 3000);
})();

