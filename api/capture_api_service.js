const express = require('express');
const puppeteer = require('puppeteer');
const app = express();

let browser;
let capturedActions = []; // To hold actions in memory

// Utility to generate locators (unchanged)
async function generateOptimizedLocators(elementHandle, page) {
    const locators = [];

    const properties = await page.evaluate((el) => {
        const attributes = Array.from(el.attributes).reduce((acc, attr) => {
            acc[attr.name] = attr.value;
            return acc;
        }, {});
        return {
            tagName: el.tagName,
            id: el.id,
            className: el.className,
            name: el.name || '',
            ariaLabel: el.getAttribute('aria-label') || '',
            textContent: el.textContent.trim(),
            attributes,
        };
    }, elementHandle);

    const { id, name, className, ariaLabel } = properties;

    // Add unique locators
    if (id) locators.push({ type: 'id', value: `#${id}` });
    if (name) locators.push({ type: 'name', value: `[name="${name}"]` });
    if (ariaLabel) locators.push({ type: 'aria-label', value: `[aria-label="${ariaLabel}"]` });

    // Add class-based selector
    if (className) {
        const classSelector = `.${className.split(' ').join('.')}`;
        locators.push({ type: 'class', value: classSelector });
    }

    // Add XPath
    const xpath = await page.evaluate((el) => {
        const getXPath = (node) => {
            if (node.id) return `//*[@id="${node.id}"]`;
            const parts = [];
            while (node && node.nodeType === Node.ELEMENT_NODE) {
                let siblingIndex = 1;
                let sibling = node.previousSibling;
                while (sibling) {
                    if (sibling.nodeType === Node.ELEMENT_NODE && sibling.tagName === node.tagName) {
                        siblingIndex++;
                    }
                    sibling = sibling.previousSibling;
                }
                const tagName = node.tagName.toLowerCase();
                const pathIndex = siblingIndex > 1 ? `[${siblingIndex}]` : '';
                parts.unshift(`${tagName}${pathIndex}`);
                node = node.parentNode;
            }
            return parts.length ? `/${parts.join('/')}` : null;
        };
        return getXPath(el);
    }, elementHandle);
    locators.push({ type: 'xpath', value: xpath });

    return locators;
}

// Endpoint to start capturing actions
app.get('/start-capture', async (req, res) => {
    try {
        console.log('Starting interaction capture...');

        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
        const page = await browser.newPage();

        const targetUrl = req.query.url || 'https://example.com';
        await page.goto(targetUrl);
        console.log(`Navigated to: ${targetUrl}`);

        capturedActions = [];
        res.send(`Capture started on ${targetUrl}. Perform actions in the browser.`);
    } catch (error) {
        console.error('Error starting capture:', error.message);
        res.status(500).send('Error starting capture: ' + error.message);
    }
});

// Endpoint to stop capturing actions
app.get('/stop-capture', async (req, res) => {
    try {
        if (browser) {
            await browser.close();
            console.log('Browser closed successfully.');

            res.json({
                message: 'Capture stopped successfully.',
                actions: capturedActions,
            });
        } else {
            res.status(400).send('No active browser session to stop.');
        }
    } catch (error) {
        console.error('Error stopping capture:', error.message);
        res.status(500).send('Error stopping capture: ' + error.message);
    }
});

// Endpoint to fetch captured actions JSON
app.get('/fetch-actions', (req, res) => {
    try {
        if (capturedActions.length === 0) {
            res.status(404).send({ error: 'No actions captured yet.' });
        } else {
            res.json(capturedActions);
        }
    } catch (error) {
        console.error('Error fetching actions:', error.message);
        res.status(500).send('Error fetching actions: ' + error.message);
    }
});

// Export the app as a serverless function
module.exports = (req, res) => {
    app(req, res);
};
