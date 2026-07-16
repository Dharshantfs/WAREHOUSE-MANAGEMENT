from setuptools import setup, find_packages

version = "0.0.1"

setup(
    name="wms_app",
    version=version,
    description="WMS Roll & Bay Stock Tracker",
    author="Antigravity",
    author_email="antigravity@gemini.com",
    packages=find_packages(),
    zip_safe=False,
    include_package_data=True,
    install_requires=[]
)
