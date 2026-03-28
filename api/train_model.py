import joblib
import pandas as pd
from sklearn.ensemble import RandomForestClassifier

from feature_normalize import normalize_features


def train(csv_path="historical_features.csv", model_out="drowsiness_model.pkl"):
    """
    CSV columns: eye_closure, blink_rate, head_tilt, reaction_time, label.
    label: 0 = SAFE, 1 = NOT SAFE.
    Rows are normalized the same way as api/app.py before fit.
    """
    data = pd.read_csv(csv_path)
    rows = []
    for _, row in data.iterrows():
        e, b, h, r, _ = normalize_features(
            row["eye_closure"],
            row["blink_rate"],
            row["head_tilt"],
            row["reaction_time"],
        )
        rows.append([e, b, h, r])
    x = pd.DataFrame(rows, columns=["eye_norm", "blink_norm", "head_norm", "reaction_norm"])
    y = data["label"]

    model = RandomForestClassifier(n_estimators=200, random_state=42)
    model.fit(x, y)
    joblib.dump(model, model_out)
    print(f"Saved model to {model_out}")


if __name__ == "__main__":
    train()
