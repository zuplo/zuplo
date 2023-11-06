export default (input: any) => {
  if (input !== "hello") {
    return [
      {
        message: 'Value must equal "hello".',
      },
    ];
  }
};
