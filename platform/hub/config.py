import os

HERE = os.path.dirname(os.path.abspath(__file__))
PLATFORM = os.path.dirname(HERE)


def env(name, default=None):
    return os.environ.get(name, default)


def hub_db_path():
    return env('HUB_DB_PATH') or os.path.join(HERE, 'instance', 'hub.db')


def itam_db_path():
    return env('ITAM_DB_PATH') or os.path.join(PLATFORM, 'itam', 'instance', 'itam.db')


def cybershield_db_path():
    return env('CYBERSHIELD_DB_PATH') or os.path.join(PLATFORM, 'cybershield', 'instance', 'cybershield.db')


def itam_url():
    return env('ITAM_URL', 'http://localhost:5057')


def cybershield_url():
    return env('CYBERSHIELD_URL', 'http://localhost:5076')


# Training is treated as current for this many days after completion (annual refresher).
TRAINING_VALID_DAYS = int(env('TRAINING_VALID_DAYS', '365'))
