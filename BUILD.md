# Build and Distribution Guide

This guide explains how to build and distribute the SA Mock Address Generator package.

## Prerequisites

1. Python 3.7+ installed
2. Virtual environment activated
3. Build tools installed:
   ```bash
   pip install build twine
   ```

## Building the Package

### 1. Clean Previous Builds
```bash
rm -rf dist/ build/ *.egg-info/
```

### 2. Build the Package
```bash
python -m build
```

This creates both source distribution (`.tar.gz`) and wheel (`.whl`) files in the `dist/` directory.

### 3. Verify the Build
```bash
ls dist/
# Should show:
# sa_mock_address_generator-1.0.0-py3-none-any.whl
# sa-mock-address-generator-1.0.0.tar.gz
```

## Testing the Package

### 1. Test in Clean Environment
```bash
# Create new virtual environment
python -m venv test_env
source test_env/bin/activate

# Install from wheel
pip install dist/sa_mock_address_generator-1.0.0-py3-none-any.whl

# Test functionality
sa-lookup-address "Adelaide"
sa-generate-addresses 3 --seed 42

# Test Python API
python -c "from sa_mock_address_generator import generate_sa_addresses; print('Success!')"
```

## Distribution

### 1. Test PyPI (Optional)
```bash
# Upload to Test PyPI first
twine upload --repository testpypi dist/*

# Test installation from Test PyPI
pip install --index-url https://test.pypi.org/simple/ sa-mock-address-generator
```

### 2. Upload to PyPI
```bash
# Upload to real PyPI
twine upload dist/*
```

### 3. Install from PyPI
```bash
pip install sa-mock-address-generator
```

## GitHub Release

1. Create a new release on GitHub
2. Tag version: `v1.0.0`
3. Upload the built files from `dist/` as release assets
4. Write release notes based on CHANGELOG.md

## API Key Configuration

When users install the package, they need to configure their Google Maps API key:

```bash
export GOOGLE_API_KEY="your_api_key_here"
```

Or create a `.env` file:
```bash
echo "GOOGLE_API_KEY=your_api_key_here" > .env
```

## Development Installation

For development:
```bash
git clone https://github.com/rNLKJA/sa-mock-address-generator.git
cd sa-mock-address-generator
pip install -e .
```

## Version Updates

To release a new version:

1. Update version in:
   - `sa_mock_address_generator/__init__.py`
   - `setup.py`
   - `pyproject.toml`

2. Update `CHANGELOG.md`

3. Commit and tag:
   ```bash
   git commit -am "Release v1.0.1"
   git tag v1.0.1
   git push origin main --tags
   ```

4. Build and upload new version
