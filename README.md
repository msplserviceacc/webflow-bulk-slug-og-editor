
# Webflow Bulk Slug + OG Editor (Designer App)

This is a tiny Designer App that lets you edit static page **slugs** and **Open Graph image URLs** in bulk.

## Quick Start (Dev)
1. Install Node 18+.
2. `npm install`
3. `npm run dev`
4. Use a local server tunnel (if needed) or deploy to Vercel/Netlify for use in Webflow Designer.

## Build
- `npm run build` (outputs `dist/`). Deploy `dist/` as a static site.

## Webflow App Setup (high-level)
- Create a Webflow App in the App Designer.
- Scopes: sites:read, pages:read, pages:write, site_configuration:read, site_configuration:write
- Surface: Designer → Panel → Entry: /index.html
- Install the app on your site, open Designer → Apps → this app.
