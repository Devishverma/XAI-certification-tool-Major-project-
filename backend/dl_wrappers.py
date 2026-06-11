import numpy as np
import pandas as pd
import warnings

class UniversalModelWrapper:
    """
    A unified wrapper for Scikit-Learn, PyTorch, TensorFlow, and ONNX models.
    Provides standard .predict() and .predict_proba() methods compatible with
    pandas DataFrames, converting them into the necessary tensor formats.
    """
    def __init__(self, model_path, extension):
        self.model_path = model_path
        self.extension = extension.lower()
        self.model = None
        self.framework = None
        self._load_model()

    def _load_model(self):
        if self.extension in ['.pkl', '.joblib']:
            import joblib
            self.model = joblib.load(self.model_path)
            self.framework = 'sklearn'
            
        elif self.extension in ['.pt', '.pth']:
            try:
                import torch
                import sys
                import types
                
                # Inject SimpleNN into __mp_main__ so pickle can find it
                import torch.nn as nn
                class SimpleNN(nn.Module):
                    def __init__(self, input_dim):
                        super().__init__()
                        self.net = nn.Sequential(
                            nn.Linear(input_dim, 16),
                            nn.ReLU(),
                            nn.Linear(16, 1)
                        )
                    def forward(self, x):
                        return self.net(x)
                        
                if '__mp_main__' not in sys.modules:
                    sys.modules['__mp_main__'] = types.ModuleType('__mp_main__')
                sys.modules['__mp_main__'].SimpleNN = SimpleNN
                
                # Load PyTorch model (assuming it's a full model or script module)
                self.model = torch.load(self.model_path, map_location='cpu', weights_only=False)
                if hasattr(self.model, 'eval'):
                    self.model.eval()
                self.framework = 'pytorch'
            except ImportError:
                raise ImportError("PyTorch is not installed. Please install 'torch' to use .pt files.")
                
        elif self.extension == '.onnx':
            try:
                import onnxruntime as ort
                self.model = ort.InferenceSession(self.model_path)
                self.framework = 'onnx'
            except ImportError:
                raise ImportError("ONNX Runtime is not installed. Please install 'onnxruntime' to use .onnx files.")
                
        elif self.extension == '.h5':
            try:
                import tensorflow as tf
                self.model = tf.keras.models.load_model(self.model_path)
                self.framework = 'tensorflow'
            except ImportError:
                warnings.warn("TensorFlow is not installed on this system. Running in Mock Mode for .h5 files.")
                self.framework = 'tensorflow_mock'
        else:
            raise ValueError(f"Unsupported extension: {self.extension}")

    def _prepare_input(self, X):
        """Converts Pandas DataFrame to Numpy Array, then to Framework Tensor"""
        if isinstance(X, pd.DataFrame):
            # Only take numerical columns for DL models
            X = X.select_dtypes(include=[np.number]).values
        elif isinstance(X, list):
            X = np.array(X)
            
        X = X.astype(np.float32)
        return X

    def predict_proba(self, X):
        if self.framework == 'sklearn':
            return self.model.predict_proba(X)
            
        X_arr = self._prepare_input(X)
        
        if self.framework == 'pytorch':
            import torch
            with torch.no_grad():
                tensor_x = torch.tensor(X_arr)
                outputs = self.model(tensor_x)
                if outputs.shape[1] == 1:
                    probs = torch.sigmoid(outputs).numpy()
                    return np.hstack((1 - probs, probs))
                else:
                    probs = torch.softmax(outputs, dim=1).numpy()
                    return probs
                    
        elif self.framework == 'onnx':
            input_name = self.model.get_inputs()[0].name
            outs = self.model.run(None, {input_name: X_arr})
            
            # Handle ZipMap output (list of dicts) common in skl2onnx
            if len(outs) > 1 and isinstance(outs[1], list) and isinstance(outs[1][0], dict):
                probs = []
                for d in outs[1]:
                    # Some models use string keys like '0' and '1' or ints 0 and 1
                    p0 = d.get(0, d.get('0', 0.0))
                    p1 = d.get(1, d.get('1', 0.0))
                    probs.append([p0, p1])
                return np.array(probs)
                
            outputs = outs[0]
            if len(outputs.shape) > 1 and outputs.shape[1] == 1:
                from scipy.special import expit
                probs = expit(outputs)
                return np.hstack((1 - probs, probs))
            elif len(outputs.shape) > 1:
                from scipy.special import softmax
                return softmax(outputs, axis=1)
            else:
                # 1D array fallback
                return np.array([[1-float(p), float(p)] for p in outputs])
                
        elif self.framework == 'tensorflow':
            outputs = self.model.predict(X_arr, verbose=0)
            if outputs.shape[1] == 1:
                return np.hstack((1 - outputs, outputs))
            return outputs
            
        elif self.framework == 'tensorflow_mock':
            # Mock predictions for testing without TF installed
            return np.random.rand(len(X_arr), 2)
            
    def predict(self, X):
        if self.framework == 'sklearn':
            return self.model.predict(X)
            
        probs = self.predict_proba(X)
        return np.argmax(probs, axis=1)

    # Scikit-learn duck-typing for compatibility with LIME / Permutation Importance
    @property
    def classes_(self):
        return np.array([0, 1])
