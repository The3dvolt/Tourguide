
import os
from onnxruntime.quantization import quantize_dynamic, QuantType

# Define the paths for the input and output models
input_model_path = 'tour-guide-app/public/models/hal.onnx'
output_model_path = 'tour-guide-app/public/models/hal_quantized.onnx'

# Quantize the model
quantize_dynamic(
    model_input=input_model_path,
    model_output=output_model_path,
    weight_type=QuantType.QInt8
)

# Get the file sizes
original_size_bytes = os.path.getsize(input_model_path)
quantized_size_bytes = os.path.getsize(output_model_path)

# Calculate the size difference in megabytes
size_difference_mb = (original_size_bytes - quantized_size_bytes) / (1024 * 1024)

print(f"Original model size: {original_size_bytes / (1024 * 1024):.2f} MB")
print(f"Quantized model size: {quantized_size_bytes / (1024 * 1024):.2f} MB")
print(f"Saved {size_difference_mb:.2f} MB after quantization.")
