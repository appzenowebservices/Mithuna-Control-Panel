#!/bin/bash
# Verification script for agent-369 skill
# Usage: ./verify-skill.sh

echo "=== Agent 369 Skill Verification ==="
echo ""

# Check SKILL.md exists
if [ -f "SKILL.md" ]; then
    echo "✓ SKILL.md found"
    # Verify frontmatter
    if head -1 SKILL.md | grep -q "^---$"; then
        echo "✓ Frontmatter present"
    else
        echo "✗ Missing frontmatter"
        exit 1
    fi
else
    echo "✗ SKILL.md not found"
    exit 1
fi

# Check references directory
if [ -d "references" ]; then
    echo "✓ references/ directory exists"
    file_count=$(ls -1 references/*.md 2>/dev/null | wc -l)
    echo "  - $file_count reference file(s)"
else
    echo "⚠ references/ directory missing"
fi

# Check for required sections
echo ""
echo "=== Content Validation ==="
if grep -q "## Overview" SKILL.md; then
    echo "✓ Overview section present"
fi
if grep -q "## The 369" SKILL.md; then
    echo "✓ Framework section present"
fi
if grep -q "## References" SKILL.md; then
    echo "✓ References section present"
fi

echo ""
echo "=== Agent 369 Skill Ready ==="