import { HtmlProcessor } from './scrapers/processor'

const html = `
<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body>
  <h1>Test Page</h1>
  <a href="/page1">Link 1</a>
  <a href="http://example.com/page2">Link 2</a>
  <a href="mailto:test@example.com">Email</a>
  <a href="#anchor">Anchor</a>
  <a href="https://google.com">Google</a>
</body>
</html>
`

const baseUrl = 'http://example.com'
const links = HtmlProcessor.extractHyperlinks(html, baseUrl)
console.log('Extracted hyperlinks:', JSON.stringify(links, null, 2))
console.log('Count:', links.length)

// Test with options
const linksFiltered = HtmlProcessor.extractHyperlinks(html, baseUrl, { includeExternal: false })
console.log('Internal only:', linksFiltered.length)

const linksLimited = HtmlProcessor.extractHyperlinks(html, baseUrl, { limit: 2 })
console.log('Limited to 2:', linksLimited.length)