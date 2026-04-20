#!/bin/bash
# Upload wiki content to GitHub wiki

set -e

# Store the original directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "📚 Draft Bench Wiki Upload Script"
echo "==================================="
echo ""

# Check if wiki-content directory exists
if [ ! -d "$SCRIPT_DIR/wiki-content" ]; then
    echo "❌ Error: wiki-content directory not found"
    exit 1
fi

# Clone the wiki repository
echo "📥 Cloning wiki repository..."
cd /tmp
rm -rf obsidian-draft-bench.wiki
git clone git@github.com:banisterious/obsidian-draft-bench.wiki.git

# Check if clone was successful
if [ ! -d "obsidian-draft-bench.wiki" ]; then
    echo "❌ Error: Failed to clone wiki repository"
    echo "   Make sure the wiki has been initialized on GitHub"
    echo "   (Create at least one page via the GitHub web interface first)"
    exit 1
fi

# Copy all wiki content
echo "📝 Copying wiki content..."
cd obsidian-draft-bench.wiki
cp -r "$SCRIPT_DIR/wiki-content/"* .

# Commit and push
echo "🚀 Uploading to GitHub..."
git add .
git commit -m "Update wiki content"
git push origin master

echo ""
echo "✅ Wiki upload complete!"
echo "📖 View at: https://github.com/banisterious/obsidian-draft-bench/wiki"
echo ""

# Cleanup
cd "$SCRIPT_DIR"
echo "🧹 Cleanup complete"
