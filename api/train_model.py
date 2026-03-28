import joblib
import pandas as pd
from sklearn.ensemble import RandomForestClassifier


def train(csv_path="historical_features.csv", model_out="drowsiness_model.pkl"):
    data = pd.read_csv(csv_path)
    x = data[["eye_closure", "blink_rate", "head_tilt", "reaction_time"]]
    y = data["label"]

    model = RandomForestClassifier(n_estimators=200, random_state=42)
    model.fit(x, y)
    joblib.dump(model, model_out)
    print(f"Saved model to {model_out}")


if __name__ == "__main__":
    train()
