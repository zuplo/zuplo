#!/bin/bash

# Define the base directory
# Get the current working directory
current_dir=$(pwd)

# Define the relative path
relative_path="examples"

# Combine them to get the full path
full_path="$current_dir/$relative_path"

# Loop through each directory in the base directory
for dir in "$full_path"/*/; do
  # Check if it is a directory
  if [ -d "$dir" ]; then
   npx @zuplo/cli@latest project update --no-prompt --dir "$dir"
  fi
done