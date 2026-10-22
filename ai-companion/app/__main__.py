import uvicorn
from .config import Config
from .main import create_app

if __name__ == '__main__':
    config = Config.load()
    uvicorn.run(create_app(config), host='127.0.0.1', port=config.port, workers=1, access_log=False)
