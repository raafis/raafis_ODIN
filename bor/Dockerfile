# Use an official Python runtime as a parent image
FROM continuumio/miniconda3

########### PREPARE EVERYTHING FOR BUILDING #####################

# Install all dependencies
RUN apt-get update
RUN apt-get -y install build-essential
RUN apt-get install -y git python3-dev cmake make gcc g++ libssl-dev

########################### PREPARED #############################

################# BUILDING PYMGCLIENT ############################

# Create a conda environment
RUN conda create -n bor_env python=3.9.16

# Activate the conda environment
SHELL ["conda", "run", "-n", "bor_env", "/bin/bash", "-c"]

# Install pymgclient from PyPI (pre-built wheel; avoids OpenSSL source-build issues)
RUN pip install pymgclient

################# BUILDING PYMGCLIENT FINISHED #####################

################# INSTALLING AND RUNNING MAGICGRAPH ################

# Set the working directory inside the container
WORKDIR /usr/src/bor

# Copy the current directory contents into the container at /usr/src/bor
COPY . /usr/src/bor

RUN pip install --upgrade pip
RUN pip install setuptools wheel

# Install the project dependencies
RUN pip install --no-cache-dir -e . -vv

# Ollama-based dependencies (replaces openai)
RUN pip install langchain-ollama langchain-community httpx "chromadb>=0.4.13"

# Needed for nltk to work (punkt_tab required in NLTK >= 3.8)
RUN python -m nltk.downloader punkt punkt_tab

# Command to run the application
ENTRYPOINT ["conda", \
            "run", \
            "--no-capture-output", \
            "-n", \
            "bor_env", \
            "uvicorn", \
            "core.restapi.api:app", \
            "--host", \
            "0.0.0.0", \
            "--port", \
            "8000"]

################# FINISHED ##########################################
