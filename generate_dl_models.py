import os
import numpy as np
import pandas as pd
import h5py
from backend.models import ModelManager

def create_mock_tf_model(filepath):
    # Just create an empty h5 file to simulate a TF model upload
    with h5py.File(filepath, 'w') as f:
        f.attrs['backend'] = b'tensorflow'
        f.attrs['keras_version'] = b'2.12.0'
        
import torch
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

def create_pytorch_model(X_train, y_train, filepath):
    input_dim = X_train.shape[1]
    model = SimpleNN(input_dim)
    
    # Train for a few steps just so weights aren't completely random
    criterion = nn.BCEWithLogitsLoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=0.01)
    
    X_t = torch.tensor(X_train.values, dtype=torch.float32)
    y_t = torch.tensor(y_train, dtype=torch.float32).view(-1, 1)
    
    for _ in range(10):
        optimizer.zero_grad()
        out = model(X_t)
        loss = criterion(out, y_t)
        loss.backward()
        optimizer.step()
        
    torch.save(model, filepath)
    
def create_onnx_model(X_train, y_train, filepath):
    from sklearn.linear_model import LogisticRegression
    from skl2onnx import convert_sklearn
    from skl2onnx.common.data_types import FloatTensorType
    
    model = LogisticRegression(max_iter=100)
    model.fit(X_train, y_train)
    
    initial_type = [('float_input', FloatTensorType([None, X_train.shape[1]]))]
    onnx_model = convert_sklearn(model, initial_types=initial_type)
    
    with open(filepath, "wb") as f:
        f.write(onnx_model.SerializeToString())

if __name__ == "__main__":
    os.makedirs('pretrained_models', exist_ok=True)
    m = ModelManager()
    m.load_benchmark()
    m.train_model('random_forest')
    
    X_num = m.X_train.select_dtypes(include=[np.number])
    
    print("Generating mock TF (.h5) model...")
    create_mock_tf_model('pretrained_models/adult_tf_model.h5')
    
    print("Generating PyTorch (.pt) model...")
    create_pytorch_model(X_num, m.y_train, 'pretrained_models/adult_pytorch_model.pt')
    
    print("Generating ONNX (.onnx) model...")
    try:
        import skl2onnx
        create_onnx_model(X_num, m.y_train, 'pretrained_models/adult_onnx_model.onnx')
    except ImportError:
        print("skl2onnx not installed, skipping ONNX model generation.")
        
    print("Done!")
