import wave
import sys
# Ensure you have piper-tts installed: pip install piper-tts
from piper.voice import PiperVoice

def text_to_speech(text: str, model_path: str, output_file: str):
    # We assume the .json file exists at model_path + ".json"
    try:
        print(f"Loading model from: {model_path}")
        voice = PiperVoice.load(model_path)
        
        with wave.open(output_file, "wb") as wav_file:
            voice.synthesize(text, wav_file)
            
        print(f"Successfully generated audio at: {output_file}")
        
    except Exception as e:
        print(f"Error loading voice: {e}")
        print("Ensure both the .onnx and .onnx.json files exist and are named correctly.")

# IMPORTANT: The .onnx file was not renamed due to tool limitations.
# Please manually rename 'tour-guide-app/public/models/hal.onnx' to 'tour-guide-app/public/models/en_US-hal-medium.onnx'
# The 'en_US-hal-medium.onnx.json' file has been created and updated.
MODEL_PATH = "./tour-guide-app/public/models/en_US-hal-medium.onnx" 
OUTPUT_WAV = "hal_output.wav"
TEXT = "I am completely operational, and all my circuits are functioning perfectly."

if __name__ == "__main__":
    text_to_speech(TEXT, MODEL_PATH, OUTPUT_WAV)
