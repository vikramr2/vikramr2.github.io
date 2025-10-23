# Content Management System

This directory contains JSON files that define the content for each section of the website.

## Structure

Each section (about, research, projects, experience, journal) has its own JSON file.

### JSON Format

```json
{
  "cards": [
    {
      "image": "assets/image.jpg",
      "imageAlt": "Description of image",
      "imageWidth": "400",  // Optional
      "imageHeight": "400", // Optional
      "header": "Card Header", // Optional
      "paragraphs": [
        "Plain text paragraph that will be wrapped in <p> tags",
        "<b>You can also use HTML tags directly</b>",
        "<a href='url'>Links work too</a>",
        "<ul><li>Lists</li><li>Also work</li></ul>",
        "<img src='path' alt='alt' width='500'>"
      ]
    }
  ]
}
```

## How It Works

1. **Paragraphs Array**: Each card has a `paragraphs` array containing the text content
2. **Auto-wrapping**: Plain text paragraphs are automatically wrapped in `<p class="card-text">` tags
3. **HTML Support**: If a paragraph contains HTML tags (detected by `<` and `>`), it's used as-is
4. **Images**: Can be specified in the card object (left side) or inline in paragraphs

## Editing Content

To update content:

1. Open the relevant JSON file (e.g., `about.json`)
2. Edit the paragraphs array
3. Save the file
4. Refresh the webpage - changes will load automatically

## Examples

### Simple Text
```json
"paragraphs": [
  "This is a plain paragraph.",
  "This is another paragraph."
]
```

### With HTML
```json
"paragraphs": [
  "<b>Bold text</b>",
  "Text with a <a href='url'>link</a>",
  "<ul><li>Item 1</li><li>Item 2</li></ul>"
]
```

### Mixed
```json
"paragraphs": [
  "Plain text paragraph",
  "<b>Important Note</b>",
  "More plain text",
  "<img src='assets/image.jpg' alt='Description' width='500'>"
]
```

## Card Images

Images specified in the card object (not in paragraphs) appear on the left side of the card:
- Used for sections: `about` and `research`
- Specified with `image`, `imageAlt`, and optional `imageWidth`/`imageHeight`

## Adding New Cards

To add a new card to a section, add a new object to the `cards` array:

```json
{
  "cards": [
    { /* existing card */ },
    { /* new card here */ }
  ]
}
```

Multiple cards will show carousel navigation automatically.
