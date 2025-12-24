# Add New Bidder Adapter

Create a new bidder adapter for the specified SSP/DSP:

1. **Research**: Check their OpenRTB implementation docs
2. **Adapter code**: Following existing adapter patterns
3. **Configuration**: YAML/JSON config entries needed
4. **Testing**: Unit tests + example bid request/response
5. **Documentation**: Integration guide for publishers

Include:
- Endpoint URL construction
- Authentication (API key, etc.)
- Bid request transformations
- Bid response parsing
- Error handling for timeouts/errors
- Any custom parameters they support

Follow the existing adapter patterns in this codebase exactly.
