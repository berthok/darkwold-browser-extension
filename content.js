// Content script to transform WoldianGames page format

(function() {
    'use strict';

    // New post detection state
    let initialMostRecentDatetime = null;
    let currentMostRecentDatetime = null;
    let newPostsDetected = false;
    let postDetectionInitialized = false;
    let userStartedWriting = false;
    let datetimeWhenWritingStarted = null;
    let isSubmitting = false; // Flag to prevent double-submission

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
        // Handle both single and double slash in URLs
        const isGamePage = window.location.href.includes('/games/index.php') || 
                          window.location.href.includes('/archives/index.php') ||
                          window.location.href.includes('//archives/index.php');
        
        // Check if this is an edit post page
        const isEditPostPage = window.location.href.includes('/include/layout/editPost.php');
        
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
            
            // Initialize new post detection
            initializeNewPostDetection();
        }
        
        if (isEditPostPage) {
            // Add BBCode toolbar to edit form
            addBBCodeToolbar();
            
            // Transform the edit form layout
            const form = document.querySelector('form[name="postForm"]');
            if (form) {
                transformFormLayout(form);
            }
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
        
        // Transform form from table to modern div-based layout
        transformFormLayout(form);
        
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
    
    function transformFormLayout(form) {
        // Check if already transformed
        if (form.classList.contains('form-transformed')) {
            return;
        }
        
        // Find the inner table that contains the form fields
        // Edit post forms might have different table structure
        const innerTable = form.querySelector('table[summary="post entry form"], table[summary="post entry table"], form > table');
        if (!innerTable) {
            // If no table found, the form might already be transformed or use a different structure
            // Try to find any table in the form
            const anyTable = form.querySelector('table');
            if (!anyTable) {
                return;
            }
        }
        
        // Create new container structure
        const formWrapper = document.createElement('div');
        formWrapper.className = 'modern-form-wrapper';
        
        // Extract form elements (hidden inputs will remain in the form)
        const postNameInput = form.querySelector('#post_name, input[name="post_name"]');
        const dieRollsDiv = form.querySelector('#rollsdiv');
        const dieRollsTextarea = form.querySelector('textarea[name="die_rolls"]'); // Edit post form uses textarea
        const explanationDiv = form.querySelector('#explanation');
        // Get all dice buttons - they might be in different structures
        const allDiceButtons = Array.from(form.querySelectorAll('input[type="button"][value^="d"], .diebutton'));
        const clickRollButtons = allDiceButtons.filter(btn => {
            const row = btn.closest('tr');
            return row && (row.textContent.includes('Click&Roll') || row.textContent.includes('Click&amp;Roll'));
        });
        const messageTextarea = form.querySelector('#message, textarea[name="message"]');
        const bbcodeToolbar = form.querySelector('#bbcode-toolbar');
        const previewContainer = form.querySelector('#bbcode-preview');
        const previewWrapper = form.querySelector('.preview-wrapper');
        const previewButton = form.querySelector('#preview-btn');
        const privatePostCheckbox = form.querySelector('input[name="privatePost"]');
        const submitButton = form.querySelector('input[type="submit"], input.submit, button.submit');
        const errorDiv = form.querySelector('#errorsFound');
        
        // Build new structure
        // Error message
        if (errorDiv) {
            const errorSection = document.createElement('div');
            errorSection.className = 'form-section form-error-section';
            errorSection.appendChild(errorDiv);
            formWrapper.appendChild(errorSection);
        }
        
        // Post Name
        if (postNameInput) {
            const section = document.createElement('div');
            section.className = 'form-section';
            const label = document.createElement('label');
            label.className = 'form-label';
            label.innerHTML = '<b>Post Name:</b>';
            label.setAttribute('for', 'post_name');
            const inputWrapper = document.createElement('div');
            inputWrapper.className = 'form-input-wrapper';
            inputWrapper.appendChild(postNameInput);
            section.appendChild(label);
            section.appendChild(inputWrapper);
            formWrapper.appendChild(section);
        }
        
        // Die Rolls - handle both div (new posts) and textarea (edit posts)
        if (dieRollsDiv || dieRollsTextarea) {
            const section = document.createElement('div');
            section.className = 'form-section';
            const label = document.createElement('label');
            label.className = 'form-label';
            label.innerHTML = '<b>Die Rolls:</b>';
            const rollsWrapper = document.createElement('div');
            rollsWrapper.className = 'form-input-wrapper';
            if (dieRollsDiv) {
                rollsWrapper.appendChild(dieRollsDiv);
            } else if (dieRollsTextarea) {
                rollsWrapper.appendChild(dieRollsTextarea);
            }
            
            // Preserve the hidden die_rolls input - it must stay in the form for submission
            const dieRollsHiddenInput = form.querySelector('#die_rolls, input[name="die_rolls"]');
            if (dieRollsHiddenInput) {
                // Keep it in the form, not in the wrapper
                // The dice buttons should still reference it correctly
            }
            
            if (explanationDiv) {
                rollsWrapper.appendChild(explanationDiv);
            }
            section.appendChild(label);
            section.appendChild(rollsWrapper);
            formWrapper.appendChild(section);
        }
        
        // Click & Roll - preserve all dice buttons
        // Get all dice buttons (both .diebutton class and input buttons with dice values)
        const allDiceButtonsForClickRoll = Array.from(form.querySelectorAll('input[type="button"][value^="d"], .diebutton')).filter(btn => {
            const value = btn.value || '';
            // Check if it's a dice button (d100, d20, etc.) and not the Roll button
            return value.match(/^d\d+$/i) && !btn.closest('tr')?.textContent.includes('MultiRoll');
        });
        
        if (allDiceButtonsForClickRoll.length > 0 || clickRollButtons.length > 0) {
            const section = document.createElement('div');
            section.className = 'form-section';
            const label = document.createElement('label');
            label.className = 'form-label';
            label.innerHTML = '<b>Click&Roll:</b>';
            const buttonsWrapper = document.createElement('div');
            buttonsWrapper.className = 'form-controls-wrapper dice-buttons-wrapper';
            
            // Use clickRollButtons if available, otherwise use all dice buttons
            const buttonsToMove = clickRollButtons.length > 0 ? clickRollButtons : allDiceButtonsForClickRoll;
            buttonsToMove.forEach(btn => {
                // Move button to new location (preserves event handlers)
                buttonsWrapper.appendChild(btn);
            });
            section.appendChild(label);
            section.appendChild(buttonsWrapper);
            formWrapper.appendChild(section);
        }
        
        // MultiRoll - handle both new post form and edit post form field names
        const multiRollRow = Array.from(form.querySelectorAll('tr')).find(tr => 
            tr.textContent.includes('MultiRoll')
        );
        if (multiRollRow) {
            const section = document.createElement('div');
            section.className = 'form-section';
            const label = document.createElement('label');
            label.className = 'form-label';
            label.innerHTML = '<b>MultiRoll:</b>';
            const controlsWrapper = document.createElement('div');
            controlsWrapper.className = 'form-controls-wrapper multiroll-wrapper';
            
            // Try new post form field names first, then edit post form names
            const numDice = form.querySelector('#numdice, input[name="numdice"], input[name="numDie"]');
            const dieSides = form.querySelector('#diesides, select[name="diesides"], select[name="dieSides"]');
            const dieModifier = form.querySelector('#diemodifier, select[name="diemodifier"], select[name="dieMod"]');
            const rollButton = form.querySelector('#multiroll, input[type="button"][value="Roll"]');
            
            if (numDice) controlsWrapper.appendChild(numDice);
            if (dieSides) controlsWrapper.appendChild(dieSides);
            if (dieModifier) controlsWrapper.appendChild(dieModifier);
            if (rollButton) controlsWrapper.appendChild(rollButton);
            
            section.appendChild(label);
            section.appendChild(controlsWrapper);
            formWrapper.appendChild(section);
        }
        
        // Message
        if (messageTextarea) {
            const section = document.createElement('div');
            section.className = 'form-section';
            const labelWrapper = document.createElement('div');
            labelWrapper.className = 'form-label-wrapper';
            const label = document.createElement('label');
            label.className = 'form-label';
            label.innerHTML = '<b>Message:</b>';
            label.setAttribute('for', 'message');
            labelWrapper.appendChild(label);
            if (previewButton) {
                labelWrapper.appendChild(previewButton);
            }
            const inputWrapper = document.createElement('div');
            inputWrapper.className = 'form-input-wrapper';
            if (bbcodeToolbar) {
                inputWrapper.appendChild(bbcodeToolbar);
            }
            inputWrapper.appendChild(messageTextarea);
            section.appendChild(labelWrapper);
            section.appendChild(inputWrapper);
            formWrapper.appendChild(section);
            
            // Preview
            if (previewWrapper || previewContainer) {
                const previewSection = document.createElement('div');
                previewSection.className = 'form-section form-preview-section';
                if (previewWrapper) {
                    previewSection.appendChild(previewWrapper);
                } else if (previewContainer) {
                    const wrapper = document.createElement('div');
                    wrapper.className = 'preview-wrapper';
                    wrapper.appendChild(previewContainer);
                    previewSection.appendChild(wrapper);
                }
                formWrapper.appendChild(previewSection);
            }
        }
        
        // Private Post checkbox
        if (privatePostCheckbox) {
            const section = document.createElement('div');
            section.className = 'form-section form-checkbox-section';
            const checkboxWrapper = document.createElement('div');
            checkboxWrapper.className = 'form-checkbox-wrapper';
            checkboxWrapper.appendChild(privatePostCheckbox);
            const checkboxLabel = document.createElement('label');
            checkboxLabel.innerHTML = '<b>Post Private to DMs</b>';
            checkboxLabel.setAttribute('for', privatePostCheckbox.id || 'privatePost');
            checkboxWrapper.appendChild(checkboxLabel);
            section.appendChild(checkboxWrapper);
            formWrapper.appendChild(section);
        }
        
        // Submit button
        if (submitButton) {
            const section = document.createElement('div');
            section.className = 'form-section form-submit-section';
            section.appendChild(submitButton);
            formWrapper.appendChild(section);
        }
        
        // Before replacing, ensure die_rolls hidden input is preserved
        const dieRollsHiddenInput = form.querySelector('#die_rolls, input[name="die_rolls"]');
        let dieRollsInputPreserved = null;
        if (dieRollsHiddenInput) {
            // Clone it to preserve it
            dieRollsInputPreserved = dieRollsHiddenInput.cloneNode(true);
        }
        
        // Replace the table structure with new div structure
        const outerTable = form.querySelector('table[summary="post entry table"]');
        if (outerTable) {
            outerTable.parentNode.replaceChild(formWrapper, outerTable);
        } else if (innerTable) {
            innerTable.parentNode.replaceChild(formWrapper, innerTable);
        }
        
        // Ensure die_rolls hidden input is in the form (critical for dice roll submission)
        if (dieRollsInputPreserved) {
            // Check if it still exists (might have been moved)
            const existingInput = form.querySelector('#die_rolls, input[name="die_rolls"]');
            if (!existingInput) {
                // Re-add it to the form
                form.appendChild(dieRollsInputPreserved);
            }
        } else {
            // Create it if it doesn't exist
            const hiddenInput = document.createElement('input');
            hiddenInput.type = 'hidden';
            hiddenInput.id = 'die_rolls';
            hiddenInput.name = 'die_rolls';
            hiddenInput.value = '';
            form.appendChild(hiddenInput);
        }
        
        // Ensure all other hidden inputs remain in the form
        const allHiddenInputs = formWrapper.querySelectorAll('input[type="hidden"]');
        allHiddenInputs.forEach(input => {
            // Move hidden inputs to the form element itself
            form.appendChild(input);
        })
        
        // Mark as transformed
        form.classList.add('form-transformed');
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
            // Skip javascript: links (like Edit Post buttons) - they need to execute in the same window
            if (link.href && link.href.toLowerCase().startsWith('javascript:')) {
                return;
            }
            
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
            // Check for new posts if detection is initialized
            if (postDetectionInitialized && typeof window.checkForNewPosts === 'function') {
                window.checkForNewPosts();
            }
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
    
    // New post detection functions
    function parseDatetime(datetimeString) {
        // Parse datetime strings like "Monday December 8th, 2025 5:26:43 PM"
        // or "Wednesday December 10th, 2025 4:19:33 AM"
        if (!datetimeString || !datetimeString.trim()) {
            return null;
        }
        
        try {
            // Remove ordinal suffixes (st, nd, rd, th) from day numbers
            let cleaned = datetimeString.trim().replace(/(\d+)(st|nd|rd|th)/g, '$1');
            
            // Parse the format explicitly for reliability
            // Format: "Monday December 8, 2025 5:26:43 PM"
            const match = cleaned.match(/(\w+day)\s+(\w+)\s+(\d+),\s+(\d+)\s+(\d+):(\d+):(\d+)\s+(AM|PM)/i);
            if (match) {
                const [, dayOfWeek, month, day, year, hour, minute, second, ampm] = match;
                const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                                  'July', 'August', 'September', 'October', 'November', 'December'];
                const monthIndex = monthNames.findIndex(m => m.toLowerCase() === month.toLowerCase());
                
                if (monthIndex !== -1) {
                    let hour24 = parseInt(hour, 10);
                    if (ampm.toUpperCase() === 'PM' && hour24 !== 12) {
                        hour24 += 12;
                    } else if (ampm.toUpperCase() === 'AM' && hour24 === 12) {
                        hour24 = 0;
                    }
                    
                    const date = new Date(parseInt(year, 10), monthIndex, parseInt(day, 10), 
                                         hour24, parseInt(minute, 10), parseInt(second, 10));
                    
                    // Check if date is valid
                    if (!isNaN(date.getTime())) {
                        return date;
                    }
                }
            }
            
            // Fallback: try JavaScript Date constructor
            let date = new Date(cleaned);
            if (!isNaN(date.getTime())) {
                return date;
            }
            
            console.warn('Could not parse datetime:', datetimeString);
            return null;
        } catch (e) {
            console.error('Error parsing datetime:', datetimeString, e);
            return null;
        }
    }
    
    function getMostRecentPostDatetime() {
        // Get all post datetime elements
        const datetimeElements = document.querySelectorAll('.post-datetime');
        let mostRecent = null;
        let mostRecentDate = null;
        
        console.log('getMostRecentPostDatetime: Found', datetimeElements.length, 'datetime elements');
        
        datetimeElements.forEach((element, index) => {
            const datetimeText = element.textContent.trim();
            const date = parseDatetime(datetimeText);
            
            console.log(`  Element ${index}: "${datetimeText}" ->`, date);
            
            if (date && (!mostRecentDate || date > mostRecentDate)) {
                mostRecent = datetimeText;
                mostRecentDate = date;
            }
        });
        
        console.log('Most recent datetime:', mostRecent, mostRecentDate);
        return { text: mostRecent, date: mostRecentDate };
    }
    
    function getNewPostCount() {
        // Count how many posts are newer than the reference datetime
        const referenceDatetime = userStartedWriting ? datetimeWhenWritingStarted : initialMostRecentDatetime;
        if (!referenceDatetime) {
            console.log('getNewPostCount: No reference datetime available');
            return 0;
        }
        
        console.log('getNewPostCount: Reference datetime:', referenceDatetime);
        
        const datetimeElements = document.querySelectorAll('.post-datetime');
        let newPostCount = 0;
        
        datetimeElements.forEach((element, index) => {
            const datetimeText = element.textContent.trim();
            const date = parseDatetime(datetimeText);
            
            if (date) {
                const isNewer = date > referenceDatetime;
                console.log(`  Post ${index}: "${datetimeText}" (${date}) is ${isNewer ? 'NEWER' : 'older or equal'} than reference`);
                if (isNewer) {
                    newPostCount++;
                }
            }
        });
        
        console.log('getNewPostCount: Found', newPostCount, 'new posts');
        return newPostCount;
    }
    
    function initializeNewPostDetection() {
        if (postDetectionInitialized) return;
        postDetectionInitialized = true;
        
        // Get initial most recent datetime after posts are transformed
        // Try multiple times to ensure posts are fully loaded and transformed
        const tryInitialize = (attempt = 1) => {
            const mostRecent = getMostRecentPostDatetime();
            
            if (!mostRecent.date && attempt < 5) {
                // Posts might not be transformed yet, try again
                console.log(`Initialization attempt ${attempt}: No datetimes found yet, retrying...`);
                setTimeout(() => tryInitialize(attempt + 1), 500);
                return;
            }
            
            if (mostRecent.date) {
                initialMostRecentDatetime = mostRecent.date;
                currentMostRecentDatetime = mostRecent.date;
                datetimeWhenWritingStarted = mostRecent.date;
                console.log('New post detection initialized. Most recent post datetime:', mostRecent.text, mostRecent.date);
            } else {
                console.warn('New post detection initialized but no datetimes found. Detection may not work correctly.');
            }
            
            // Set up form submission interception
            interceptFormSubmission();
            
            // Monitor for new posts
            monitorForNewPosts();
            
            // Track when user starts writing
            trackUserWriting();
        };
        
        // Start initialization after a delay
        setTimeout(() => tryInitialize(1), 1000);
    }
    
    function trackUserWriting() {
        // Track when user starts interacting with the form
        const form = document.querySelector('form[name="postForm"]');
        if (!form) {
            setTimeout(trackUserWriting, 1000);
            return;
        }
        
        const messageTextarea = form.querySelector('textarea[name="message"], #message');
        const postNameInput = form.querySelector('input[name="post_name"], #post_name');
        
        const markWritingStarted = () => {
            if (!userStartedWriting) {
                userStartedWriting = true;
                const mostRecent = getMostRecentPostDatetime();
                datetimeWhenWritingStarted = mostRecent.date;
                console.log('User started writing. Most recent post datetime at start:', mostRecent.text, mostRecent.date);
                if (!datetimeWhenWritingStarted) {
                    console.warn('Warning: Could not get datetime when writing started. New post detection may not work correctly.');
                }
            }
        };
        
        if (messageTextarea) {
            messageTextarea.addEventListener('input', markWritingStarted, { once: true });
            messageTextarea.addEventListener('focus', markWritingStarted, { once: true });
        }
        
        if (postNameInput) {
            postNameInput.addEventListener('input', markWritingStarted, { once: true });
            postNameInput.addEventListener('focus', markWritingStarted, { once: true });
        }
    }
    
    function fetchLatestPostDatetimes() {
        // Fetch the current page to check for new posts
        return fetch(window.location.href, {
            method: 'GET',
            cache: 'no-cache',
            headers: {
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            }
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.text();
        })
        .then(html => {
            // Parse the HTML to extract datetime information
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            // Find all datetime strings in the fetched HTML
            // Look for font elements with size="-1" that contain datetime patterns
            // Format: <font size="-1"><br>Monday December 8th, 2025 5:26:43 PM</font>
            const datetimePattern = /\w+day\s+\w+\s+\d+[a-z]{0,2},\s+\d{4}\s+\d+:\d+:\d+\s+(AM|PM)/i;
            const datetimes = [];
            const seenDatetimes = new Set(); // To avoid duplicates
            
            // Search in font elements (original format before transformation)
            const fontElements = doc.querySelectorAll('font[size="-1"]');
            fontElements.forEach(font => {
                // Get text content (this will include text after <br> tags)
                const text = font.textContent || '';
                const match = text.match(datetimePattern);
                if (match) {
                    // Extract the datetime string
                    const datetimeText = match[0].trim();
                    if (!seenDatetimes.has(datetimeText)) {
                        seenDatetimes.add(datetimeText);
                        const date = parseDatetime(datetimeText);
                        if (date) {
                            datetimes.push({ text: datetimeText, date: date });
                        }
                    }
                }
            });
            
            // Also search the raw HTML string for datetime patterns (more reliable)
            const htmlMatches = html.match(new RegExp(datetimePattern.source, 'gi'));
            if (htmlMatches) {
                htmlMatches.forEach(match => {
                    const datetimeText = match.trim();
                    if (!seenDatetimes.has(datetimeText)) {
                        seenDatetimes.add(datetimeText);
                        const date = parseDatetime(datetimeText);
                        if (date) {
                            datetimes.push({ text: datetimeText, date: date });
                        }
                    }
                });
            }
            
            // Find the most recent datetime
            let mostRecent = null;
            let mostRecentDate = null;
            datetimes.forEach(dt => {
                if (!mostRecentDate || dt.date > mostRecentDate) {
                    mostRecent = dt.text;
                    mostRecentDate = dt.date;
                }
            });
            
            console.log('Fetched page: Found', datetimes.length, 'datetimes, most recent:', mostRecent, mostRecentDate);
            return { text: mostRecent, date: mostRecentDate, allDatetimes: datetimes };
        })
        .catch(error => {
            console.error('Error fetching latest posts:', error);
            return null;
        });
    }
    
    function monitorForNewPosts() {
        let checkInterval = null;
        let isUserTyping = false;
        let typingTimeout = null;
        
        // Function to check for new posts (both local DOM and fetched page)
        const checkForNewPosts = () => {
            // Don't check if user is actively typing
            if (isUserTyping) {
                console.log('Skipping new post check - user is actively typing');
                return;
            }
            
            // First check local DOM (in case posts were added dynamically)
            const localMostRecent = getMostRecentPostDatetime();
            const referenceDatetime = userStartedWriting ? datetimeWhenWritingStarted : initialMostRecentDatetime;
            
            // Then fetch the page to check for new posts on the server
            fetchLatestPostDatetimes()
                .then(fetchedData => {
                    if (!fetchedData || !fetchedData.date) {
                        console.log('Could not fetch latest datetimes, using local check only');
                        // Fall back to local check
                        checkLocalPosts(localMostRecent, referenceDatetime);
                        return;
                    }
                    
                    // Compare fetched data with reference
                    if (referenceDatetime && fetchedData.date > referenceDatetime) {
                        // Count new posts from fetched data
                        const newPostCount = fetchedData.allDatetimes.filter(dt => 
                            dt.date > referenceDatetime
                        ).length;
                        
                        if (newPostCount > 0) {
                            if (!newPostsDetected || fetchedData.date > currentMostRecentDatetime) {
                                newPostsDetected = true;
                                currentMostRecentDatetime = fetchedData.date;
                                console.log(`New posts detected from server! ${newPostCount} new post(s) since ${userStartedWriting ? 'writing started' : 'page load'}.`);
                                
                                // Show a visual indicator
                                showNewPostIndicator(newPostCount);
                            }
                        }
                    } else {
                        // Also check local posts in case they were added to DOM
                        checkLocalPosts(localMostRecent, referenceDatetime);
                    }
                });
        };
        
        // Helper function to check local DOM posts
        const checkLocalPosts = (localMostRecent, referenceDatetime) => {
            if (localMostRecent.date && referenceDatetime && localMostRecent.date > referenceDatetime) {
                if (!newPostsDetected || localMostRecent.date > currentMostRecentDatetime) {
                    newPostsDetected = true;
                    currentMostRecentDatetime = localMostRecent.date;
                    const newPostCount = getNewPostCount();
                    if (newPostCount > 0) {
                        console.log(`New posts detected in DOM! ${newPostCount} new post(s) since ${userStartedWriting ? 'writing started' : 'page load'}.`);
                        showNewPostIndicator(newPostCount);
                    }
                }
            }
        };
        
        // Track when user is typing in form fields
        const form = document.querySelector('form[name="postForm"]');
        if (form) {
            const messageTextarea = form.querySelector('textarea[name="message"], #message');
            const postNameInput = form.querySelector('input[name="post_name"], #post_name');
            
            const markUserTyping = () => {
                isUserTyping = true;
                // Clear existing timeout
                if (typingTimeout) {
                    clearTimeout(typingTimeout);
                }
                // Reset typing flag after 5 seconds of inactivity
                typingTimeout = setTimeout(() => {
                    isUserTyping = false;
                    console.log('User stopped typing, resuming new post checks');
                }, 5000);
            };
            
            if (messageTextarea) {
                messageTextarea.addEventListener('input', markUserTyping);
                messageTextarea.addEventListener('keydown', markUserTyping);
            }
            
            if (postNameInput) {
                postNameInput.addEventListener('input', markUserTyping);
                postNameInput.addEventListener('keydown', markUserTyping);
            }
        }
        
        // Check periodically (every 2 minutes to avoid too many requests)
        checkInterval = setInterval(checkForNewPosts, 120000);
        
        // Also check after DOM mutations (hooked into existing observer via transformPage calls)
        // This will be called by the existing MutationObserver
        window.checkForNewPosts = checkForNewPosts;
    }
    
    function showNewPostIndicator(count) {
        // Remove existing indicator if present
        const existingIndicator = document.getElementById('new-posts-indicator');
        if (existingIndicator) {
            existingIndicator.remove();
        }
        
        // Create indicator
        const indicator = document.createElement('div');
        indicator.id = 'new-posts-indicator';
        indicator.className = 'new-posts-indicator';
        const message = userStartedWriting 
            ? `${count} new post${count > 1 ? 's' : ''} detected since you started writing`
            : `${count} new post${count > 1 ? 's' : ''} detected since page load`;
        indicator.innerHTML = `
            <span class="indicator-icon">⚠️</span>
            <span class="indicator-text">${message}</span>
            <button class="indicator-dismiss" onclick="this.parentElement.remove()">×</button>
        `;
        
        // Find the submit button and insert indicator right after it
        const form = document.querySelector('form[name="postForm"]');
        if (form) {
            const submitButton = form.querySelector('input[type="button"].submit, button.submit, input.submit');
            if (submitButton) {
                // Check if form is using modern layout
                const submitSection = submitButton.closest('.form-submit-section');
                if (submitSection) {
                    // Modern layout - insert after submit section
                    submitSection.parentNode.insertBefore(indicator, submitSection.nextSibling);
                } else {
                    // Old table layout - find the parent cell (td) that contains the submit button
                    const submitCell = submitButton.closest('td');
                    if (submitCell) {
                        const submitRow = submitCell.closest('tr');
                        if (submitRow) {
                            // Create a new row for the indicator
                            const indicatorRow = document.createElement('tr');
                            const indicatorCell = document.createElement('td');
                            indicatorCell.colSpan = 3;
                            indicatorCell.style.textAlign = 'center';
                            indicatorCell.style.paddingTop = '10px';
                            indicatorCell.appendChild(indicator);
                            indicatorRow.appendChild(indicatorCell);
                            
                            // Insert after the submit button's row
                            submitRow.parentNode.insertBefore(indicatorRow, submitRow.nextSibling);
                        } else {
                            // Fallback: insert in the same cell after the button
                            submitCell.appendChild(indicator);
                        }
                    } else {
                        // Fallback: insert after the submit button
                        submitButton.parentNode.insertBefore(indicator, submitButton.nextSibling);
                    }
                }
            } else {
                // Fallback: insert before the form
                form.parentNode.insertBefore(indicator, form);
            }
        } else {
            // Fallback: insert at top of body
            document.body.insertBefore(indicator, document.body.firstChild);
        }
    }
    
    function interceptFormSubmission() {
        // Find the form
        const form = document.querySelector('form[name="postForm"]');
        if (!form) {
            // Try again later if form not found
            setTimeout(interceptFormSubmission, 1000);
            return;
        }
        
        // Helper function to handle submission with all checks
        const handleSubmission = function(e) {
            // Prevent double-submission
            if (isSubmitting) {
                return; // Already processing submission
            }
            
            // Always prevent default first
            e.preventDefault();
            e.stopImmediatePropagation();
            
            // Check for new posts - fetch latest data from server
            console.log('=== Checking for new posts before submission ===');
            const referenceDatetime = userStartedWriting ? datetimeWhenWritingStarted : initialMostRecentDatetime;
            console.log('Reference datetime:', referenceDatetime, '(userStartedWriting:', userStartedWriting, ')');
            
            // Fetch latest data and check
            fetchLatestPostDatetimes()
                .then(fetchedData => {
                    let hasNewPosts = false;
                    let newPostCount = 0;
                    
                    if (fetchedData && fetchedData.date && referenceDatetime && fetchedData.date > referenceDatetime) {
                        // Count new posts from fetched data
                        newPostCount = fetchedData.allDatetimes.filter(dt => 
                            dt.date > referenceDatetime
                        ).length;
                        hasNewPosts = newPostCount > 0;
                        console.log('Fetched data: Most recent datetime:', fetchedData.date);
                        console.log('Has new posts?', hasNewPosts, '(newPostCount:', newPostCount, ')');
                    } else {
                        // Fallback to local check
                        const mostRecent = getMostRecentPostDatetime();
                        console.log('Using local check: Most recent datetime:', mostRecent.date);
                        newPostCount = getNewPostCount();
                        hasNewPosts = mostRecent.date && referenceDatetime && mostRecent.date > referenceDatetime && newPostCount > 0;
                        console.log('Has new posts?', hasNewPosts, '(newPostCount:', newPostCount, ')');
                    }
                    
                    // Step 1: Check for new posts and warn if needed
                    if (hasNewPosts) {
                        proceedWithSubmission(newPostCount);
                    } else {
                        // No new posts, proceed directly to confirmation
                        proceedWithSubmission(0);
                    }
                })
                .catch(error => {
                    console.error('Error checking for new posts:', error);
                    // On error, fall back to local check
                    const mostRecent = getMostRecentPostDatetime();
                    const newPostCount = getNewPostCount();
                    const hasNewPosts = mostRecent.date && referenceDatetime && mostRecent.date > referenceDatetime && newPostCount > 0;
                    proceedWithSubmission(hasNewPosts ? newPostCount : 0);
                });
            
            // Helper function to proceed with submission after checking for new posts
            function proceedWithSubmission(newPostCount) {
                // Step 1: Check for new posts and warn if needed
                if (newPostCount > 0) {
                    const continueSubmission = confirm(
                        `⚠️ Warning: ${newPostCount} new post${newPostCount > 1 ? 's have' : ' has'} been detected since you started writing your post.\n\n` +
                        `Would you like to review the new posts before submitting?\n\n` +
                        `Click "OK" to continue with submission, or "Cancel" to review posts first.`
                    );
                    
                    if (!continueSubmission) {
                        // User clicked Cancel - wants to review posts
                        scrollToNewPosts();
                        return false;
                    }
                    // User clicked OK - wants to continue, proceed to general confirmation
                }
                
                // Step 2: Show general submission confirmation
                const confirmSubmission = confirm(
                    `Are you sure you want to submit this post?\n\n` +
                    `Click "OK" to submit, or "Cancel" to go back and edit.`
                );
                
                if (confirmSubmission) {
                    // User confirmed - set flag and submit
                    isSubmitting = true;
                    form.removeEventListener('submit', handleSubmission);
                    form.submit();
                } else {
                    // User cancelled - do nothing, let them continue editing
                    return false;
                }
            }
        };
        
        // Intercept form submission
        form.addEventListener('submit', handleSubmission, true); // Use capture phase to intercept early
        
        // Also intercept button clicks as backup
        const submitButton = form.querySelector('input[type="button"].submit, button.submit, input.submit');
        if (submitButton) {
            submitButton.addEventListener('click', function(e) {
                // Prevent double-submission
                if (isSubmitting) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    return false;
                }
                
                // Prevent default action
                e.preventDefault();
                e.stopImmediatePropagation();
                
                // Check for new posts - fetch latest data from server
                console.log('=== Checking for new posts before submission (button click) ===');
                const referenceDatetime = userStartedWriting ? datetimeWhenWritingStarted : initialMostRecentDatetime;
                console.log('Reference datetime:', referenceDatetime, '(userStartedWriting:', userStartedWriting, ')');
                
                // Fetch latest data and check
                fetchLatestPostDatetimes()
                    .then(fetchedData => {
                        let hasNewPosts = false;
                        let newPostCount = 0;
                        
                        if (fetchedData && fetchedData.date && referenceDatetime && fetchedData.date > referenceDatetime) {
                            // Count new posts from fetched data
                            newPostCount = fetchedData.allDatetimes.filter(dt => 
                                dt.date > referenceDatetime
                            ).length;
                            hasNewPosts = newPostCount > 0;
                            console.log('Fetched data: Most recent datetime:', fetchedData.date);
                            console.log('Has new posts?', hasNewPosts, '(newPostCount:', newPostCount, ')');
                        } else {
                            // Fallback to local check
                            const mostRecent = getMostRecentPostDatetime();
                            console.log('Using local check: Most recent datetime:', mostRecent.date);
                            newPostCount = getNewPostCount();
                            hasNewPosts = mostRecent.date && referenceDatetime && mostRecent.date > referenceDatetime && newPostCount > 0;
                            console.log('Has new posts?', hasNewPosts, '(newPostCount:', newPostCount, ')');
                        }
                        
                        // Step 1: Check for new posts and warn if needed
                        if (hasNewPosts) {
                            proceedWithSubmissionButton(newPostCount);
                        } else {
                            // No new posts, proceed directly to confirmation
                            proceedWithSubmissionButton(0);
                        }
                    })
                    .catch(error => {
                        console.error('Error checking for new posts:', error);
                        // On error, fall back to local check
                        const mostRecent = getMostRecentPostDatetime();
                        const newPostCount = getNewPostCount();
                        const hasNewPosts = mostRecent.date && referenceDatetime && mostRecent.date > referenceDatetime && newPostCount > 0;
                        proceedWithSubmissionButton(hasNewPosts ? newPostCount : 0);
                    });
                
                // Helper function to proceed with submission after checking for new posts
                function proceedWithSubmissionButton(newPostCount) {
                    // Step 1: Check for new posts and warn if needed
                    if (newPostCount > 0) {
                        const continueSubmission = confirm(
                            `⚠️ Warning: ${newPostCount} new post${newPostCount > 1 ? 's have' : ' has'} been detected since you started writing your post.\n\n` +
                            `Would you like to review the new posts before submitting?\n\n` +
                            `Click "OK" to continue with submission, or "Cancel" to review posts first.`
                        );
                        
                        if (!continueSubmission) {
                            // User clicked Cancel - wants to review posts
                            scrollToNewPosts();
                            return false;
                        }
                        // User clicked OK - wants to continue, proceed to general confirmation
                    }
                    
                    // Step 2: Show general submission confirmation
                    const confirmSubmission = confirm(
                        `Are you sure you want to submit this post?\n\n` +
                        `Click "OK" to submit, or "Cancel" to go back and edit.`
                    );
                    
                    if (confirmSubmission) {
                        // User confirmed - set flag and trigger form submission
                        isSubmitting = true;
                        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
                    } else {
                        // User cancelled - do nothing
                        return false;
                    }
                }
            }, true);
        }
    }
    
    function scrollToNewPosts() {
        // Find the first new post (posts newer than the reference datetime)
        const referenceDatetime = userStartedWriting ? datetimeWhenWritingStarted : initialMostRecentDatetime;
        if (!referenceDatetime) {
            // Fallback: scroll to top of posts section
            const firstPost = document.querySelector('.character-post');
            if (firstPost) {
                firstPost.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
            return;
        }
        
        const allPosts = document.querySelectorAll('.character-post');
        let firstNewPost = null;
        
        // Find the first post with a datetime newer than the reference
        allPosts.forEach(post => {
            if (firstNewPost) return; // Already found
            
            const datetimeElement = post.querySelector('.post-datetime');
            if (datetimeElement) {
                const datetimeText = datetimeElement.textContent.trim();
                const date = parseDatetime(datetimeText);
                
                if (date && date > referenceDatetime) {
                    firstNewPost = post;
                }
            }
        });
        
        if (firstNewPost) {
            firstNewPost.scrollIntoView({ behavior: 'smooth', block: 'start' });
            // Highlight the new posts
            highlightNewPosts();
        } else {
            // Fallback: scroll to top of posts section
            const firstPost = document.querySelector('.character-post');
            if (firstPost) {
                firstPost.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    }
    
    function highlightNewPosts() {
        // Remove existing highlights
        document.querySelectorAll('.new-post-highlight').forEach(el => {
            el.classList.remove('new-post-highlight');
        });
        
        // Highlight new posts (posts newer than the reference datetime)
        const referenceDatetime = userStartedWriting ? datetimeWhenWritingStarted : initialMostRecentDatetime;
        if (!referenceDatetime) return;
        
        const allPosts = document.querySelectorAll('.character-post');
        allPosts.forEach(post => {
            const datetimeElement = post.querySelector('.post-datetime');
            if (datetimeElement) {
                const datetimeText = datetimeElement.textContent.trim();
                const date = parseDatetime(datetimeText);
                
                if (date && date > referenceDatetime) {
                    post.classList.add('new-post-highlight');
                }
            }
        });
        
        // Remove highlight after 5 seconds
        setTimeout(() => {
            document.querySelectorAll('.new-post-highlight').forEach(el => {
                el.classList.remove('new-post-highlight');
            });
        }, 5000);
    }
})();

