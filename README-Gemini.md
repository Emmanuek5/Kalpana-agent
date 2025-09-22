# Gemini AI Analysis Integration

The AI Container now includes comprehensive Google Gemini AI analysis capabilities for multi-modal content analysis including images, PDFs, videos, audio files, and text documents.

## Features

### Multi-Modal Analysis
- **Image Analysis**: Object detection, text recognition, color analysis, composition assessment
- **PDF Processing**: Text extraction, structure analysis, entity recognition, comprehensive summaries
- **Video Analysis**: Scene detection, audio analysis, visual assessment, content summarization
- **Audio Analysis**: Speech transcription, music analysis, speaker detection, audio quality assessment
- **Text Analysis**: Content analysis for various text formats (TXT, MD, HTML, CSV, JSON, XML)

### Advanced Capabilities
- **Universal File Analyzer**: Automatic file type detection and appropriate analysis method selection
- **Structured Output**: Optional JSON-formatted responses with predefined schemas
- **Custom Prompts**: Flexible prompt customization for specific analysis requirements
- **Model Selection**: Support for different Gemini models (default: gemini-2.0-flash-exp)
- **File Upload Handling**: Automatic upload for video and audio files to Gemini's servers

## Setup

### 1. Environment Variables

Add your Gemini API key and optionally set the default model in your `.env` file:

```bash
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.0-flash-exp  # Optional: Set default model (defaults to gemini-2.0-flash-exp)
```

### 2. Get Gemini API Key

1. Visit [Google AI Studio](https://aistudio.google.com/)
2. Sign in with your Google account
3. Click "Get API key" and create a new API key
4. Copy the API key to your `.env` file

### 3. Install Dependencies

The required dependency is already included in `package.json`:

```bash
bun install
```

## Usage

### Available Tools

#### `gemini.analyzeFile` - Universal File Analyzer
Automatically detects file type and uses the appropriate analysis method.

```bash
# Analyze any supported file
gemini.analyzeFile relativePath="document.pdf"
gemini.analyzeFile relativePath="image.jpg" prompt="Describe the objects and colors"
gemini.analyzeFile relativePath="video.mp4" structuredOutput=true
```

#### `gemini.analyzeImage` - Image Analysis
Specialized tool for image analysis with object detection, text recognition, and visual assessment.

```bash
# Basic image analysis
gemini.analyzeImage relativePath="photo.jpg"

# Custom prompt for specific analysis
gemini.analyzeImage relativePath="screenshot.png" prompt="Extract all text from this image"

# Structured output for consistent data extraction
gemini.analyzeImage relativePath="chart.png" structuredOutput=true
```

#### `gemini.analyzePdf` - PDF Document Analysis
Comprehensive PDF analysis with text extraction and structure analysis.

```bash
# Analyze PDF document
gemini.analyzePdf relativePath="report.pdf"

# Custom analysis focus
gemini.analyzePdf relativePath="research.pdf" prompt="Summarize the methodology and key findings"

# Structured output for data extraction
gemini.analyzePdf relativePath="invoice.pdf" structuredOutput=true
```

#### `gemini.analyzeVideo` - Video Analysis
Video content analysis with scene detection and audio analysis.

```bash
# Analyze video content
gemini.analyzeVideo relativePath="presentation.mp4"

# Focus on specific aspects
gemini.analyzeVideo relativePath="tutorial.mp4" prompt="Create a step-by-step guide based on this video"

# Structured analysis
gemini.analyzeVideo relativePath="meeting.mp4" structuredOutput=true
```

#### `gemini.analyzeAudio` - Audio Analysis
Audio content analysis with transcription and audio characteristics.

```bash
# Analyze audio file
gemini.analyzeAudio relativePath="podcast.mp3"

# Transcription focus
gemini.analyzeAudio relativePath="interview.wav" prompt="Provide a detailed transcription"

# Structured output for audio metadata
gemini.analyzeAudio relativePath="music.m4a" structuredOutput=true
```

#### `gemini.getSupportedTypes` - Supported File Types
Get a list of all supported file types categorized by media type.

```bash
# View supported file types
gemini.getSupportedTypes
```

## Supported File Formats

### Images
- JPEG, JPG, PNG, GIF, WebP, BMP, SVG, HEIC, HEIF

### Documents
- PDF, TXT, MD (Markdown), HTML, CSV, JSON, XML

### Audio
- MP3, WAV, M4A, AAC, OGG, FLAC

### Video
- MP4, AVI, MOV, WMV, FLV, WebM, MKV, M4V

## Structured Output Schemas

When using `structuredOutput: true`, responses are formatted as JSON with predefined schemas:

### Image Analysis Schema
```json
{
  "description": "Detailed description of the image",
  "objects": ["list", "of", "detected", "objects"],
  "text": "Any text found in the image",
  "colors": ["dominant", "colors"],
  "mood": "Overall mood or atmosphere",
  "technical_details": {
    "composition": "Composition analysis",
    "lighting": "Lighting conditions",
    "quality": "Image quality assessment"
  }
}
```

### Document Analysis Schema
```json
{
  "summary": "Executive summary of the document",
  "main_topics": ["main", "topics", "covered"],
  "key_points": ["key", "points", "and", "findings"],
  "structure": {
    "sections": ["document", "sections"],
    "page_count": 10,
    "document_type": "Type of document"
  },
  "entities": {
    "people": ["people", "mentioned"],
    "organizations": ["organizations", "mentioned"],
    "locations": ["locations", "mentioned"],
    "dates": ["important", "dates"]
  }
}
```

### Video Analysis Schema
```json
{
  "summary": "Overall summary of the video content",
  "scenes": [
    {
      "timestamp": "00:01:30",
      "description": "Scene description",
      "key_elements": ["key", "elements", "in", "scene"]
    }
  ],
  "audio_analysis": {
    "has_speech": true,
    "has_music": false,
    "audio_quality": "Audio quality assessment"
  },
  "visual_analysis": {
    "video_quality": "Video quality assessment",
    "dominant_colors": ["dominant", "colors"],
    "camera_work": "Camera work and cinematography"
  },
  "content_type": "Type of video content"
}
```

### Audio Analysis Schema
```json
{
  "summary": "Overall summary of the audio content",
  "content_type": "Type of audio content",
  "transcription": "Transcription if speech is detected",
  "audio_characteristics": {
    "duration_estimate": "Estimated duration",
    "quality": "Audio quality assessment",
    "volume_level": "Volume level assessment",
    "background_noise": "Background noise assessment"
  },
  "speakers": {
    "count": 2,
    "characteristics": ["speaker", "characteristics"]
  },
  "music_analysis": {
    "genre": "Music genre if applicable",
    "instruments": ["instruments", "detected"],
    "tempo": "Tempo assessment"
  }
}
```

## Workflow Examples

### Document Analysis Workflow
```bash
# 1. Upload or create a PDF in the sandbox
fs.writeFile relativePath="document.pdf" content="..."

# 2. Analyze the PDF with Gemini
gemini.analyzePdf relativePath="document.pdf" prompt="Extract key insights and create a summary"

# 3. Save analysis results
fs.writeFile relativePath="analysis_results.txt" content="..."
```

### Image Processing Workflow
```bash
# 1. Analyze an image with structured output
gemini.analyzeImage relativePath="chart.png" structuredOutput=true

# 2. Process the structured data
# (Use the JSON response to extract specific information)

# 3. Generate a report based on the analysis
edit.subAgentWrite relativePath="image_report.md" instruction="Create a detailed report based on the image analysis"
```

### Multi-Modal Analysis Workflow
```bash
# 1. Analyze multiple file types
gemini.analyzeFile relativePath="presentation.pdf"
gemini.analyzeFile relativePath="demo_video.mp4"
gemini.analyzeFile relativePath="audio_notes.mp3"

# 2. Combine insights from all analyses
edit.subAgentWrite relativePath="comprehensive_analysis.md" instruction="Combine insights from PDF, video, and audio analysis into a comprehensive report"
```

## Integration with Other AI Container Features

### Google Drive Integration
```bash
# 1. Check Google Drive authentication
pDrive.isAccountLinked

# 2. Read file from Google Drive
pDrive.readFile fileId="your_file_id"

# 3. Analyze the downloaded file
gemini.analyzeFile relativePath="downloaded_file.pdf"

# 4. Save analysis back to Google Drive
pDrive.writeFile name="analysis_results.txt" content="..."
```

### Sandbox Integration
```bash
# 1. Process files in the sandbox environment
exec.command command="wget https://example.com/document.pdf"

# 2. Analyze with Gemini
gemini.analyzePdf relativePath="document.pdf"

# 3. Use analysis results in your application
exec.command command="python process_analysis.py"
```

## Error Handling

The Gemini tools include comprehensive error handling:

- **Missing API Key**: Clear error message if `GEMINI_API_KEY` is not set
- **Unsupported File Types**: Detailed error with list of supported formats
- **File Upload Failures**: Graceful handling of upload issues for video/audio files
- **Processing Failures**: Clear error messages for file processing issues
- **Network Issues**: Proper error handling for API connectivity problems

## Best Practices

1. **API Key Security**: Store your Gemini API key securely in environment variables
2. **File Size Considerations**: Large video/audio files may take longer to process
3. **Custom Prompts**: Use specific prompts for better analysis results
4. **Structured Output**: Use structured output for consistent data extraction
5. **Error Handling**: Always check the `success` field in responses
6. **Rate Limits**: Be mindful of Gemini API rate limits for high-volume usage
7. **File Cleanup**: Video and audio files are automatically cleaned up after analysis

## Troubleshooting

### Common Issues

1. **"GEMINI_API_KEY environment variable is required"**
   - Solution: Add your Gemini API key to the `.env` file

2. **"Unsupported file type"**
   - Solution: Check supported formats with `gemini.getSupportedTypes`

3. **"File processing failed"**
   - Solution: Ensure the file exists and is not corrupted

4. **"Video/Audio file processing failed"**
   - Solution: Check file format and size; some formats may not be supported

### Getting Help

- Check the console output for detailed error messages
- Use `gemini.getSupportedTypes` to verify file format support
- Ensure your Gemini API key has sufficient quota
- Verify file paths are relative to the sandbox workspace

## Model Information

### Default Model
- **gemini-2.0-flash-exp**: Latest experimental Gemini model with enhanced capabilities

### Model Selection
You can specify different models using the `model` parameter:
```bash
gemini.analyzeImage relativePath="image.jpg" model="gemini-2.0-flash-exp"
```

Available models depend on your Gemini API access level. Check the [Gemini API documentation](https://ai.google.dev/gemini-api/docs) for the latest model availability.
