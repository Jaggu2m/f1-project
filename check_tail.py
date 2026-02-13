
with open(r"c:\projects\f1project\frontend\public\race_positions_silverstone_2023_leaderboard2.json", "rb") as f:
    try:
        f.seek(-100, 2)
        print(f.read().decode("utf-8"))
    except OSError:
        print("File too small")
