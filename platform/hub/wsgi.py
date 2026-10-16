"""WSGI entry point.  Factory form:  waitress-serve --call hub.wsgi:factory
Object form (gunicorn etc.):        hub.wsgi:application"""
from hub.app import get_app


def factory():
    return get_app()


def __getattr__(name):          # lazily build `application` so importing never has side effects
    if name == 'application':
        return get_app()
    raise AttributeError(name)
